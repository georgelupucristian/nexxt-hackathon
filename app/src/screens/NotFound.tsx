import { Compass } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button, EmptyState } from '../components/ui';

export function NotFound() {
  const nav = useNavigate();
  return (
    <div className="screen screen--bare screen--center">
      <EmptyState icon={Compass} title="Page not found" body="This page doesn’t exist or has moved." action={<Button variant="primary" onClick={() => nav('/')}>Go home</Button>} />
    </div>
  );
}
