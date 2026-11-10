import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AdminCard, Button, Input, Select, Tabs } from '../components/ui';
import { EmptyListState, ErrorState, LoadingState } from '../../../shared/components/states';
import { humanizeAdminError } from '../utils/humanizeError';
import {
  fetchActivityRequests,
  updateActivityState,
  updateActivityArchive,
  CONSULT_STATES,
  ENROLL_STATES,
  type ActivityRequestKind,
  type ActivityRequestPage,
  type ActivityRequestState,
} from '../../landing/services/activityService';
import { formatBusinessDate } from '../services/businessTime';
import '../../landing/components/activities.css';

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
        // Si quitamos el único registro de una página posterior, volvemos
        // a la primera para no dejar una página vacía innecesariamente.
        if (page > 1 && data?.resultados.length === 1) {
          const next = new URLSearchParams(params);
          next.delete('pagina');
          setParams(next);
        } else {
          setAttempt(value => value + 1);
        }
        setNotice(shouldArchive
          ? 'Consulta archivada. Puedes recuperarla desde «Archivadas».'
          : 'Consulta desarchivada. Volvió a la bandeja de vigentes.');
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
    <section aria-label="Servicios y talleres" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p>Gestiona consultas e inscripciones gratuitas de esta tienda.</p>
        </div>
        <Link className="lp-button" to="/emprendedor/landing#secciones-tienda">
          Crear o editar una actividad ↗
        </Link>
      </div>

      <Tabs
        label="Solicitudes de actividades"
        tabs={[
          { id: 'consulta', label: 'Solicitudes de información' },
          { id: 'inscripcion', label: 'Inscripciones gratuitas' },
        ]}
        active={kind}
        disabled={!!busy}
        onChange={tipo => filter({ tipo, estado: '', archivada: '' })}
      />

      {kind === 'consulta' && (
        <Tabs
          label="Bandeja de consultas"
          tabs={[
            { id: 'vigentes', label: 'Vigentes' },
            { id: 'archivadas', label: 'Archivadas' },
          ]}
          active={archived ? 'archivadas' : 'vigentes'}
          disabled={!!busy}
          onChange={value => filter({ archivada: value === 'archivadas' ? 'true' : '' })}
        />
      )}

      <div className="activity-management-filters rounded-xl border border-[var(--border)] bg-white p-4">
        <Select
          label="Estado de gestión"
          value={state}
          disabled={!!busy}
          options={[
            { value: '', label: 'Todos los estados' },
            ...Object.entries(states).map(([value, label]) => ({ value, label })),
          ]}
          onChange={event => filter({ estado: event.target.value })}
        />
        <Input
          label="Identificador de sección (opcional)"
          value={section}
          maxLength={36}
          disabled={!!busy}
          onChange={event => filter({ seccion: event.target.value })}
        />
        <Button
          variant="outline"
          disabled={loading || !!busy}
          onClick={() => {
            setNotice('');
            setAttempt(value => value + 1);
          }}
        >
          Actualizar listado
        </Button>
      </div>

      <p>
        Estos datos se usan para gestionar solicitudes y participación. No autorizan campañas.
        Las inscripciones mostradas son gratuitas; ningún estado acredita un pago.
      </p>

      {notice && <p role="status">{notice}</p>}
      {loading && <LoadingState>Cargando solicitudes…</LoadingState>}
      {error && (
        <ErrorState onRetry={() => setAttempt(value => value + 1)}>
          {humanizeAdminError(error)}
        </ErrorState>
      )}

      {data && !loading && (
        <>
          <p>
            {data.total}{' '}
            {kind === 'consulta'
              ? archived ? 'consultas archivadas' : 'consultas vigentes'
              : 'inscripciones'}
          </p>

          {!data.resultados.length ? (
            <EmptyListState>
              {kind === 'consulta' && archived
                ? 'No hay consultas archivadas con estos filtros.'
                : 'No hay solicitudes con estos filtros.'}
            </EmptyListState>
          ) : (
            <div className="activity-management-list">
              {data.resultados.map(record => (
                <AdminCard key={record.id}>
                  <article className="space-y-3 break-words">
                    <div className="flex flex-wrap justify-between gap-3">
                      <div>
                        <h3 className="font-semibold">{record.titulo_actividad}</h3>
                        <p>
                          {record.tipo_actividad === 'taller' ? 'Taller' : 'Servicio'} ·{' '}
                          {record.nombre} {record.apellido}
                        </p>
                      </div>
                      <span className="text-xs text-[var(--muted-foreground)]">{formatBusinessDate(record.creado)}</span>
                    </div>

                    <p>Correo: {record.email}</p>
                    {record.telefono && <p>Teléfono: {record.telefono}</p>}
                    {record.mensaje && <p className="rounded-lg bg-[var(--muted)] p-3 whitespace-pre-wrap">{record.mensaje}</p>}

                    <div className="activity-management-filters">
                      <Select
                        label={`Estado de ${record.nombre} (${record.id.slice(0, 8)})`}
                        value={record.estado}
                        disabled={!!busy}
                        options={Object.entries(
                          record.tipo === 'consulta' ? CONSULT_STATES : ENROLL_STATES
                        ).map(([value, label]) => ({ value, label }))}
                        onChange={event => void changeState(
                          record.id,
                          event.target.value as ActivityRequestState
                        )}
                      />

                      {record.tipo === 'consulta' && (
                        <Button
                          variant="outline"
                          disabled={!!busy}
                          onClick={() => void changeArchive(record.id, !record.archivada)}
                        >
                          {record.archivada ? 'Desarchivar' : 'Archivar'}
                        </Button>
                      )}

                      {busy === record.id && <p role="status">Guardando cambios…</p>}
                      <Button
                        variant="ghost"
                        disabled={!!busy}
                        onClick={() => filter({ seccion: record.seccion_id })}
                      >
                        Ver solicitudes de esta actividad
                      </Button>
                    </div>
                  </article>
                </AdminCard>
              ))}
            </div>
          )}

          <nav aria-label="Paginación de solicitudes" className="flex flex-wrap items-center gap-3">
            <Button
              disabled={page <= 1 || !!busy}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('pagina', String(page - 1));
                setNotice('');
                setParams(next);
              }}
            >
              Anterior
            </Button>
            <span>Página {data.pagina} de {data.paginas}</span>
            <Button
              disabled={page >= data.paginas || !!busy}
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set('pagina', String(page + 1));
                setNotice('');
                setParams(next);
              }}
            >
              Siguiente
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
