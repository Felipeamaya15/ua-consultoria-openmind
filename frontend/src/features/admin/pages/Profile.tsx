import { useEffect, useState, type FormEvent } from 'react';
import { authService } from '../../auth/services/authService';
import { Alert, Button, Input } from '../components/ui';

export default function EntrepreneurProfile() {
  const [email, setEmail] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  useEffect(() => {
    let active = true;
    authService.getEntrepreneurProfile().then(data => {if (active) setEmail(data.email);})
      .catch(err => {if (active) setError(err.message || 'No se pudo cargar la cuenta.');});
    return () => {active = false;};
  }, []);
  async function save(event: FormEvent, password = false) {
    event.preventDefault();
    if (busy || email === null) return;
    setBusy(true); setError(''); setSuccess('');
    try {
      if (password) {
        await authService.changeEntrepreneurPassword(currentPassword, newPassword);
        setCurrentPassword(''); setNewPassword(''); setSuccess('Contraseña actualizada.');
      } else {
        const data = await authService.updateEntrepreneurProfile(email);
        setEmail(data.email); setSuccess('Correo actualizado.');
      }
    } catch (err) {setError(err instanceof Error ? err.message : 'No se pudo guardar.');}
    finally {setBusy(false);}
  }
  return <div className="max-w-xl space-y-5">
    <h2 className="font-semibold text-xl">Mi cuenta · Emprendedor</h2>
    {error && <Alert variant="error">{error}</Alert>}
    {success && <Alert variant="success">{success}</Alert>}
    {email === null ? (!error && <p role="status">Cargando cuenta…</p>) : <>
      <form onSubmit={event => save(event)} className="bg-white border rounded-xl p-5 space-y-4">
        <Input label="Correo electrónico" type="email" autoComplete="email" required maxLength={254} value={email} onChange={e => {setEmail(e.target.value); setSuccess('');}} />
        <Button type="submit" disabled={busy}>Guardar correo</Button>
      </form>
      <form onSubmit={event => save(event, true)} className="bg-white border rounded-xl p-5 space-y-4">
        <h3 className="font-semibold">Cambiar contraseña</h3>
        <Input label="Contraseña actual" type="password" autoComplete="current-password" required value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
        <Input label="Nueva contraseña" type="password" autoComplete="new-password" required value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        <Button type="submit" disabled={busy}>Cambiar contraseña</Button>
      </form>
    </>}
  </div>;
}
