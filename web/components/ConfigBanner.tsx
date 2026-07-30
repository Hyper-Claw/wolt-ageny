import { isConfigured } from "@/lib/contracts";

/** Warns when the launchpad contract address hasn't been configured yet. */
export function ConfigBanner() {
  if (isConfigured) return null;
  return (
    <div className="card mb-6 border-yellow-500/40 bg-yellow-500/10 p-4 text-sm text-yellow-200">
      <p className="font-bold">Launchpad address not set</p>
      <p className="mt-1 text-yellow-200/80">
        Deploy the contracts to Arc (<code>cd contracts &amp;&amp; npm run deploy:arc</code>) and set{" "}
        <code>NEXT_PUBLIC_LAUNCHPAD_ADDRESS</code> in <code>web/.env.local</code>, then restart the
        dev server.
      </p>
    </div>
  );
}
