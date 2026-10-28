import { Compass } from '@/lib/icons';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export function NotFound() {
  const nav = useNavigate();
  return (
    <div className="screen screen--bare screen--center">
      <EmptyState icon={Compass} title="N-am găsit pagina" body="Pagina asta nu există sau s-a mutat." action={<Button variant="primary" onClick={() => nav('/')}>Înapoi acasă</Button>} />
    </div>
  );
}
