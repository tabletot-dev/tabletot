interface FeatureGateProps {
  requiredProvider: string;
  children: React.ReactNode;
}

const posProvider = import.meta.env.VITE_POS_PROVIDER || 'tabletot';

export function FeatureGate({ requiredProvider, children }: FeatureGateProps) {
  if (posProvider !== requiredProvider) {
    return (
      <div className="p-6">
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This feature is not available for your plan ({posProvider}). Contact support to upgrade.
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
