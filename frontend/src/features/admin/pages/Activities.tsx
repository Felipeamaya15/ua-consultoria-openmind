import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminCard, Badge, Button, Icon, Input, Select, Tabs } from '../components/ui';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import {
  fetchActivityRequests,
  updateActivityState,
  updateActivityArchive,
  CONSULT_STATES,
  ENROLL_STATES,
  type ActivityRequest,
  type ActivityRequestKind,
  type ActivityRequestPage,
  type ActivityRequestState,
} from '../../landing/services/activityService';
import { formatBusinessDate } from '../services/businessTime';
import '../../landing/components/activities.css';

function getStatusBadge(record: ActivityRequest) {
  if (record.tipo === 'consulta') {
    switch (record.estado) {
      case 'nueva':
        return <Badge variant="info">Nueva consulta</Badge>;
      case 'en_revision':
        return <Badge variant="warning">En revisión</Badge>;
      case 'respondida':
        return <Badge variant="success">Respondida</Badge>;
      case 'cerrada':
        return <Badge variant="default">Cerrada</Badge>;
      default:
        return <Badge variant="default">{CONSULT_STATES[record.estado as keyof typeof CONSULT_STATES] || record.estado}</Badge>;
    }
  }

  switch (record.estado) {
    case 'pendiente':
      return <Badge variant="warning">Pendiente de confirmación</Badge>;
    case 'confirmada':
      return <Badge variant="success">Confirmada (Gratuita)</Badge>;
    case 'cancelada':
      return <Badge variant="error">Cancelada</Badge>;
    default:
      return <Badge variant="default">{ENROLL_STATES[record.estado as keyof typeof ENROLL_STATES] || record.estado}</Badge>;
  }
}

export default function Activities() {
  const [params, setParams] = useSearchParams();
  const kind: ActivityRequestKind = params.get('tipo') === 'inscripcion' ? 'inscripcion' : 'consulta';
  const state = params.get('estado') || '';
  const section = params.get('seccion') || '';
  const requestedPage = Number(params.get('pagina'));
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const archived = kind === 'consulta' && params.get('archivada') === 'true';

  const [data, setData] = useState<ActivityRequestPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState('');
  const [showAdvancedFilter, setShowAdvancedFilter] = useState(false);

  const changing = useRef(false);
  const revision = useRef(0);
  const alive = useRef(true);
  const states = kind === 'consulta' ? CONSULT_STATES : ENROLL_STATES;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const key = params.toString();
  useEffect(() => {
    const controller = new AbortController();
    const current = ++revision.current;
    setLoading(true);
    setError('');
    setData(null);

    const query = new URLSearchParams({ tipo: kind, pagina: String(page) });
    if (state) query.set('estado', state);
    if (section) query.set('seccion', section);
    // Las inscripciones siempre se consultan sin archivar.
    if (kind === 'consulta') query.set('archivada', String(archived));

    fetchActivityRequests(query, controller.signal)
      .then(result => {
        if (!controller.signal.aborted && revision.current === current) setData(result);
      })
      .catch(cause => {
        if (!controller.signal.aborted && revision.current === current) {
          setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
        }
      })
      .finally(() => {
        if (!controller.signal.aborted && revision.current === current) setLoading(false);
      });

    return () => controller.abort();
  }, [key, attempt]);

  function filter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);
    next.delete('pagina');
    for (const [field, value] of Object.entries(patch)) {
      if (value) next.set(field, value);
      else next.delete(field);
    }
    setNotice('');
    setParams(next);
  }

  async function changeState(id: string, estado: ActivityRequestState) {
    if (changing.current) return;
    changing.current = true;
    setBusy(id);
    setError('');
    setNotice('');
    const current = revision.current;

    try {
      await updateActivityState(id, estado);
      if (alive.current && current === revision.current) {
        setAttempt(value => value + 1);
        const label = kind === 'consulta'
          ? (CONSULT_STATES[estado as keyof typeof CONSULT_STATES] || estado)
          : (ENROLL_STATES[estado as keyof typeof ENROLL_STATES] || estado);
        setNotice(`Estado actualizado correctamente a «${label}».`);
      }
    } catch (cause) {
      if (alive.current && current === revision.current) {
        setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
      }
    } finally {
      changing.current = false;
      if (alive.current) setBusy('');
    }
  }

  async function changeArchive(id: string, shouldArchive: boolean) {
    if (changing.current || kind !== 'consulta') return;
    changing.current = true;
    setBusy(id);
    setError('');
    setNotice('');
    const current = revision.current;

    try {
      await updateActivityArchive(id, shouldArchive);
      if (alive.current && current === revision.current) {
        if (page > 1 && data?.resultados.length === 1) {
          const next = new URLSearchParams(params);
          next.delete('pagina');
          setParams(next);
        } else {
          setAttempt(value => value + 1);
        }
        setNotice(shouldArchive
          ? 'Consulta archivada correctamente. Puedes encontrarla en la pestaña «Archivadas».'
          : 'Consulta devuelta a la bandeja de «Vigentes».');
      }
    } catch (cause) {
      if (alive.current && current === revision.current) {
        setError(humanizeAdminError(cause instanceof Error ? cause.message : ''));
      }
    } finally {
      changing.current = false;
      if (alive.current) setBusy('');
    }
  }

  return (
    <section aria-label="Servicios y talleres" className="space-y-6 max-w-6xl">
      {/* Encabezado principal */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-[var(--border)]">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-[var(--foreground)]">Servicios y talleres</h2>
          <p className="text-sm text-[var(--muted-foreground)] mt-0.5">
            Gestiona consultas de interesados e inscripciones a las actividades de tu tienda.
          </p>
        </div>
        <Link
          className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-[var(--primary)] text-white rounded-lg text-sm font-medium shadow-sm hover:opacity-90 transition-all focus-visible:outline-2 focus-visible:outline-offset-2 shrink-0"
          to="/emprendedor/landing#secciones-tienda"
          title="Ir al editor de secciones para publicar o editar actividades"
        >
          <span>+ Crear o editar actividad</span>
          <Icon name="arrowUpRight" className="w-4 h-4" />
        </Link>
      </div>

      {/* Selector de tipo principal (Consultas vs Inscripciones) */}
      <div className="bg-white rounded-xl border border-[var(--border)] p-2 shadow-xs">
        <Tabs
          label="Solicitudes de actividades"
          tabs={[
            { id: 'consulta', label: 'Solicitudes de información' },
            { id: 'inscripcion', label: 'Inscripciones a talleres' },
          ]}
          active={kind}
          disabled={!!busy}
          onChange={tipo => filter({ tipo, estado: '', archivada: '' })}
        />
      </div>

      {/* Sub-pestañas para consultas (Vigentes vs Archivadas) */}
      {kind === 'consulta' && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider mr-1">
            Bandeja:
          </span>
          <Button
            type="button"
            variant={!archived ? 'primary' : 'outline'}
            size="sm"
            disabled={!!busy}
            onClick={() => filter({ archivada: '' })}
            className={`text-xs px-3.5 py-1.5 rounded-full ${!archived ? 'bg-[var(--primary)] text-white' : ''}`}
          >
            Vigentes (activas)
          </Button>
          <Button
            type="button"
            variant={archived ? 'primary' : 'outline'}
            size="sm"
            disabled={!!busy}
            onClick={() => filter({ archivada: 'true' })}
            className={`text-xs px-3.5 py-1.5 rounded-full ${archived ? 'bg-[var(--primary)] text-white' : ''}`}
          >
            Archivadas (historial)
          </Button>
        </div>
      )}

      {/* Barra de filtros amigable y limpia */}
      <div className="bg-white border border-[var(--border)] rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="w-full sm:w-72">
            <Select
              label="Filtrar por estado de atención"
              value={state}
              disabled={!!busy}
              options={[
                { value: '', label: 'Todos los estados' },
                ...Object.entries(states).map(([value, label]) => ({ value, label })),
              ]}
              onChange={event => filter({ estado: event.target.value })}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={loading || !!busy}
              onClick={() => {
                setNotice('');
                setAttempt(value => value + 1);
              }}
              className="flex items-center gap-1.5 text-xs text-[var(--foreground)]"
            >
              <Icon name="refresh" className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Actualizar listado</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAdvancedFilter(v => !v)}
              className="text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            >
              <span>{showAdvancedFilter ? 'Ocultar filtro técnico' : 'Búsqueda por ID'}</span>
            </Button>
          </div>
        </div>

        {/* Banner de filtro activo por actividad específica */}
        {section && (
          <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-50/80 border border-blue-200 rounded-lg p-3 text-xs text-blue-900 animate-fadeIn">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-blue-950">Filtro activo por actividad</span>
              <span className="text-blue-800">Mostrando solo las solicitudes de una actividad específica.</span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => filter({ seccion: '' })}
              className="bg-white border-blue-300 text-blue-900 hover:bg-blue-100 text-xs px-2.5 py-1"
            >
              Quitar filtro y ver todas
            </Button>
          </div>
        )}

        {/* Filtro avanzado opcional por ID de sección */}
        {showAdvancedFilter && (
          <div className="pt-2 border-t border-[var(--border)] animate-fadeIn">
            <div className="max-w-md">
              <Input
                label="Identificador técnico de sección (UUID)"
                placeholder="Ej. 81386c65-c014-4bda-9e4c..."
                value={section}
                maxLength={36}
                disabled={!!busy}
                onChange={event => filter({ seccion: event.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Banner informativo de privacidad y condiciones */}
      <div className="flex items-start gap-3 p-3.5 bg-[var(--muted)]/40 border border-[var(--border)] rounded-xl text-xs text-[var(--muted-foreground)]">
        <Icon name="shield" className="w-4 h-4 mt-0.5 text-[var(--primary)] shrink-0" />
        <div>
          <span className="font-semibold text-[var(--foreground)]">Privacidad y participación: </span>
          <span>
            Los datos de contacto se recopilan con consentimiento para coordinar la actividad. Las inscripciones son gratuitas; ningún estado acredita un pago.
          </span>
        </div>
      </div>

      {/* Mensajes de aviso, carga y error */}
      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-sm flex items-center justify-between gap-2" role="status">
          <div className="flex items-center gap-2">
            <Icon name="check" className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{notice}</span>
          </div>
          <button
            type="button"
            onClick={() => setNotice('')}
            className="text-emerald-700 hover:text-emerald-950 text-xs font-semibold px-2 py-1"
          >
            ✕
          </button>
        </div>
      )}

      {loading && <LoadingState>Cargando solicitudes…</LoadingState>}

      {error && (
        <ErrorState onRetry={() => setAttempt(value => value + 1)}>
          {humanizeAdminError(error)}
        </ErrorState>
      )}

      {/* Lista de solicitudes / inscripciones */}
      {data && !loading && (
        <>
          <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)] px-1">
            <span>
              Total encontrado:{' '}
              <strong className="text-[var(--foreground)] font-semibold">{data.total}</strong>{' '}
              {kind === 'consulta'
                ? (archived ? 'consultas archivadas' : 'consultas vigentes')
                : 'inscripciones registradas'}
            </span>
            <span>Página {data.pagina} de {data.paginas}</span>
          </div>

          {!data.resultados.length ? (
            <EmptyListState>
              {kind === 'consulta' && archived
                ? 'No hay consultas archivadas con estos filtros.'
                : 'No se encontraron solicitudes con los filtros seleccionados.'}
            </EmptyListState>
          ) : (
            <div className="activity-management-list">
              {data.resultados.map(record => {
                const isBusy = busy === record.id;
                const isCurrentSectionFiltered = section === record.seccion_id;

                return (
                  <AdminCard key={record.id} className="relative overflow-hidden transition-all hover:shadow-sm">
                    <article className="space-y-4">
                      {/* Cabecera de la tarjeta */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 pb-3 border-b border-[var(--border)]">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-[var(--muted)] text-[var(--muted-foreground)]">
                              {record.tipo_actividad === 'taller' ? 'Taller' : 'Servicio'}
                            </span>
                            <h3 className="font-bold text-base text-[var(--foreground)] leading-snug">
                              {record.titulo_actividad}
                            </h3>
                          </div>
                          <p className="text-xs text-[var(--muted-foreground)] flex items-center gap-1.5 pt-0.5">
                            <Icon name="clock" className="w-3.5 h-3.5 shrink-0 text-[var(--muted-foreground)]" />
                            <span>Recibida el {formatBusinessDate(record.creado)}</span>
                          </p>
                        </div>

                        {/* Badge de estado de atención destacado */}
                        <div className="flex items-center gap-2 shrink-0">
                          {getStatusBadge(record)}
                        </div>
                      </div>

                      {/* Datos del contacto / participante */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-[var(--muted)]/30 rounded-lg text-sm border border-[var(--border)]">
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                            Participante / Contacto
                          </span>
                          <p className="font-medium text-[var(--foreground)] flex items-center gap-1.5">
                            <Icon name="user" className="w-3.5 h-3.5 text-[var(--muted-foreground)] shrink-0" />
                            <span>{record.nombre} {record.apellido}</span>
                          </p>
                        </div>

                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                            Vías de comunicación
                          </span>
                          <div className="flex flex-col gap-1 text-xs">
                            <a
                              href={`mailto:${record.email}?subject=${encodeURIComponent(kind === 'consulta' ? `Re: Consulta sobre ${record.titulo_actividad}` : `Confirmación de inscripción: ${record.titulo_actividad}`)}`}
                              className="text-[var(--primary)] hover:underline font-medium inline-flex items-center gap-1.5 break-all"
                              title="Enviar correo"
                            >
                              <Icon name="mail" className="w-3.5 h-3.5 shrink-0" />
                              <span>{record.email}</span>
                            </a>
                            {record.telefono && (
                              <a
                                href={`tel:${record.telefono.replace(/\s+/g, '')}`}
                                className="text-[var(--foreground)] hover:underline inline-flex items-center gap-1.5"
                                title="Llamar por teléfono"
                              >
                                <Icon name="phone" className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                                <span>{record.telefono}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Mensaje de consulta / notas */}
                      {record.mensaje && (
                        <div className="bg-white border border-[var(--border)] rounded-lg p-3 text-sm space-y-1 shadow-2xs">
                          <span className="text-[11px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider block">
                            {record.tipo === 'consulta' ? 'Mensaje o duda del interesado:' : 'Comentarios de la inscripción:'}
                          </span>
                          <p className="text-[var(--foreground)] leading-relaxed whitespace-pre-wrap text-xs sm:text-sm">
                            {record.mensaje}
                          </p>
                        </div>
                      )}

                      {/* Barra de Acciones y Gestión de Estado */}
                      <div className="pt-2 border-t border-[var(--border)] flex flex-col md:flex-row md:items-center justify-between gap-3">
                        {/* Botones de acción rápida e intuitivos */}
                        <div className="flex flex-wrap items-center gap-2">
                          {record.tipo === 'consulta' ? (
                            <>
                              {record.estado !== 'respondida' && record.estado !== 'cerrada' && (
                                <Button
                                  type="button"
                                  variant="primary"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'respondida')}
                                  className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3 py-1.5 flex items-center gap-1.5 shadow-xs"
                                >
                                  <Icon name="check" className="w-3.5 h-3.5" />
                                  <span>Marcar como Respondida</span>
                                </Button>
                              )}
                              {record.estado === 'respondida' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'cerrada')}
                                  className="text-xs px-3 py-1.5 flex items-center gap-1"
                                >
                                  <span>Cerrar consulta</span>
                                </Button>
                              )}
                              {record.estado === 'cerrada' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'nueva')}
                                  className="text-xs px-3 py-1.5 flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                >
                                  <span>↺ Reabrir consulta</span>
                                </Button>
                              )}
                              <a
                                href={`mailto:${record.email}?subject=${encodeURIComponent(`Re: Consulta sobre ${record.titulo_actividad}`)}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-[var(--muted)] text-xs font-medium text-[var(--foreground)] transition-colors shadow-2xs"
                                title="Abrir tu cliente de correo para responder al interesado"
                              >
                                <Icon name="mail" className="w-3.5 h-3.5 text-[var(--primary)]" />
                                <span>Responder correo</span>
                              </a>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void changeArchive(record.id, !record.archivada)}
                                className="text-xs px-2.5 py-1.5 flex items-center gap-1 text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                                title={record.archivada ? 'Devolver consulta a vigentes' : 'Mover consulta a archivadas'}
                              >
                                <span>{record.archivada ? 'Desarchivar' : 'Archivar'}</span>
                              </Button>
                            </>
                          ) : (
                            <>
                              {record.estado === 'pendiente' && (
                                <>
                                  <Button
                                    type="button"
                                    variant="primary"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => void changeState(record.id, 'confirmada')}
                                    className="bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs px-3.5 py-1.5 flex items-center gap-1.5 shadow-xs"
                                  >
                                    <Icon name="checkCircle" className="w-4 h-4" />
                                    <span>Confirmar inscripción</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={isBusy}
                                    onClick={() => void changeState(record.id, 'cancelada')}
                                    className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                  >
                                    <span>✕ Cancelar</span>
                                  </Button>
                                </>
                              )}
                              {record.estado === 'confirmada' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'cancelada')}
                                  className="text-red-600 border-red-200 hover:bg-red-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                >
                                  <span>✕ Cancelar inscripción</span>
                                </Button>
                              )}
                              {record.estado === 'cancelada' && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void changeState(record.id, 'confirmada')}
                                  className="text-emerald-700 border-emerald-300 hover:bg-emerald-50 text-xs px-3 py-1.5 flex items-center gap-1"
                                >
                                  <span>↺ Reactivar inscripción</span>
                                </Button>
                              )}
                              <a
                                href={`mailto:${record.email}?subject=${encodeURIComponent(`Inscripción a ${record.titulo_actividad}`)}`}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-white hover:bg-[var(--muted)] text-xs font-medium text-[var(--foreground)] transition-colors shadow-2xs"
                                title="Enviar correo de confirmación o coordinación"
                              >
                                <Icon name="mail" className="w-3.5 h-3.5 text-[var(--primary)]" />
                                <span>Escribir correo</span>
                              </a>
                            </>
                          )}

                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => filter({ seccion: isCurrentSectionFiltered ? '' : record.seccion_id })}
                            className="text-xs text-[var(--muted-foreground)] hover:text-[var(--primary)]"
                            title={isCurrentSectionFiltered ? 'Quitar filtro de actividad' : 'Filtrar solo solicitudes de esta actividad'}
                          >
                            <span>{isCurrentSectionFiltered ? 'Ver todas las actividades' : 'Filtrar esta actividad'}</span>
                          </Button>
                        </div>

                        {/* Dropdown de cambio de estado completo */}
                        <div className="flex items-center gap-2 text-xs shrink-0 md:ml-auto">
                          {isBusy && <span className="text-[var(--primary)] font-medium animate-pulse">Guardando…</span>}
                          <div className="w-44">
                            <Select
                              label="Cambiar estado"
                              value={record.estado}
                              disabled={isBusy}
                              options={Object.entries(
                                record.tipo === 'consulta' ? CONSULT_STATES : ENROLL_STATES
                              ).map(([value, label]) => ({ value, label }))}
                              onChange={event => void changeState(
                                record.id,
                                event.target.value as ActivityRequestState
                              )}
                            />
                          </div>
                        </div>
                      </div>
                    </article>
                  </AdminCard>
                );
              })}
            </div>
          )}

          {/* Paginación */}
          <nav aria-label="Paginación de solicitudes" className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[var(--border)]">
            <span className="text-xs text-[var(--muted-foreground)]">
              Página <strong className="text-[var(--foreground)] font-semibold">{data.pagina}</strong> de{' '}
              <strong className="text-[var(--foreground)] font-semibold">{data.paginas}</strong> ({data.total} solicitudes en total)
            </span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page <= 1 || !!busy}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('pagina', String(page - 1));
                  setNotice('');
                  setParams(next);
                }}
              >
                ← Anterior
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={page >= data.paginas || !!busy}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set('pagina', String(page + 1));
                  setNotice('');
                  setParams(next);
                }}
              >
                Siguiente →
              </Button>
            </div>
          </nav>
        </>
      )}
    </section>
  );
}
