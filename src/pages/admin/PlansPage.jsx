import { CreditCard } from "lucide-react";

export default function PlansPage() {
  return (
    <div className="mx-auto max-w-xl animate-fade-up text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-periwinkle-tint">
        <CreditCard className="h-6 w-6 text-periwinkle-deep" />
      </div>
      <h1 className="mt-4 font-display text-3xl font-bold tracking-tight text-ink">
        Plans & billing
      </h1>
      <p className="mt-2 text-ink-soft">
        Plan definitions and Stripe subscriptions get wired in with billing.
      </p>
    </div>
  );
}
