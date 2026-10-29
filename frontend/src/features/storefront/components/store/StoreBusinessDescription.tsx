import { useStore } from '../../context/StoreContext';

/** Business information comes from Django, independently of the landing hero. */
export function StoreBusinessDescription({ className = '' }: { className?: string }) {
  const { config } = useStore();
  if (!config.description?.trim()) return null;
  return <p data-store-business-description className={`whitespace-pre-wrap break-words ${className}`}>{config.description}</p>;
}
