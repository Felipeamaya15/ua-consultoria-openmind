import { CustomerAccountNavigation } from '../components/store/CustomerAccountNavigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authService, type CustomerProfile } from '../../auth/services/authService';
import { useStorefrontTemplate } from '../hooks/useStorefrontTemplate';

export default function Profile() {
  const { route } = useStorefrontTemplate();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  useEffect(() => {
    let active = true;
    authService.getProfile().then(data => { if (active) setProfile(data); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : 'No se pudo cargar el perfil.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function save(event: FormEvent, password = false) {
    event.preventDefault();
    if (busy || !profile) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (password) {
        await authService.changePassword(currentPassword, newPassword);
        setCurrentPassword(''); setNewPassword('');
        setSuccess('Contraseña actualizada correctamente.');
      } else {
        setProfile(await authService.updateProfile(profile));
        setSuccess('Perfil guardado correctamente.');
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo guardar.'); }
    finally { setBusy(false); }
  }
  const inputClass = 'block w-full border rounded p-2 mt-1';
  return <main className="max-w-xl mx-auto w-full p-6 space-y-6">
    <CustomerAccountNavigation />
    <h1 className="text-2xl font-semibold">Mi cuenta · Perfil</h1>
    {loading && <p role="status">Cargando perfil…</p>}
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {success && <p role="status" className="text-green-700">{success}</p>}
    {!loading && !profile && <Link to={route('ingresar')} className="underline">Iniciar sesión</Link>}
    {profile && <>
      <form onSubmit={event => save(event)} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          {(['first_name', 'last_name', 'email', 'phone'] as const).map(field => <label key={field} className="block">
            {{first_name: 'Nombre', last_name: 'Apellido', email: 'Email', phone: 'Teléfono'}[field]}
            <input className={inputClass} type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
              autoComplete={{first_name: 'given-name', last_name: 'family-name', email: 'email', phone: 'tel'}[field]}
              maxLength={field === 'phone' ? 20 : field === 'email' ? 254 : 150} required={field === 'email'}
              value={profile[field]} onChange={event => { setProfile({...profile, [field]: event.target.value}); setSuccess(''); }} />
          </label>)}
          <button className="border rounded px-4 py-2" type="submit">{busy ? 'Guardando…' : 'Guardar perfil'}</button>
        </fieldset>
      </form>
      <form onSubmit={event => save(event, true)} className="space-y-4">
        <h2 className="text-xl font-semibold">Cambiar contraseña</h2>
        <fieldset disabled={busy} className="space-y-4">
          <label className="block">Contraseña actual<input className={inputClass} type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} /></label>
          <label className="block">Nueva contraseña<input className={inputClass} type="password" autoComplete="new-password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} /></label>
          <button className="border rounded px-4 py-2" type="submit">Cambiar contraseña</button>
        </fieldset>
      </form>
    </>}
  </main>;
}
