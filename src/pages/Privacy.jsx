import { LegalPage } from "@/components/landing/LegalPage";

export default function Privacy() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated="July 24, 2026"
      description="How Tackly collects, uses, and protects your data."
    >
      <p>
        This Privacy Policy explains how Tackly Inc. ("Tackly," "we," "us") collects,
        uses, and shares information when you use Tackly at tackly.co and related
        applications (the "Service").
      </p>

      <h2>1. Information we collect</h2>
      <p>We collect information in a few ways:</p>
      <ul>
        <li><strong>Account information</strong> — your email address and authentication details when you sign up.</li>
        <li><strong>Spoken and written content</strong> — audio you record, meeting transcripts our bot captures, and transcripts you upload, along with the Boards generated from them.</li>
        <li><strong>Usage data</strong> — session length, feature usage, and basic device/browser information, used to run and improve the Service.</li>
        <li><strong>Billing information</strong> — handled directly by our payment processor; we don't store your full card details ourselves.</li>
      </ul>

      <h2>2. How we use your information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Provide the core Service — transcribing conversation and generating Boards;</li>
        <li>Operate your account, including plan limits and billing;</li>
        <li>Send transactional email (like welcome messages or plan updates) — separate from any marketing you'd have to opt into;</li>
        <li>Maintain, secure, and improve the Service.</li>
      </ul>

      <h2>3. AI processing and third parties</h2>
      <p>
        To turn conversation into a Board, your audio and transcript content is
        processed by third-party infrastructure providers, including services that
        power live meeting transcription and AI models that structure the resulting
        text. These providers process your content solely to deliver that
        functionality to Tackly and are bound by their own data-processing terms. We
        also use a transactional email provider to send account-related emails and a
        payment processor to handle billing.
      </p>

      <h2>4. Meeting participants</h2>
      <p>
        If you use Tackly's meeting bot, other participants' spoken words are
        transcribed as part of the meeting. It's your responsibility to let
        participants know the meeting is being transcribed where required by law.
      </p>

      <h2>5. Data retention</h2>
      <p>
        We retain your account data, transcripts, and Boards for as long as your
        account is active, so you can keep referring back to them. If you delete a
        thread or your account, we delete the associated content within a reasonable
        period, except where we're required to retain records (for example, billing
        records) by law.
      </p>

      <h2>6. Data sharing</h2>
      <p>
        We don't sell your personal information. We share it only with the
        third-party providers described above (to operate the Service), as required
        by law, or in connection with a merger, acquisition, or sale of assets — in
        which case we'll let you know.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard measures — encryption in transit, access controls,
        and signed webhook verification for third-party integrations — to protect
        your data. No system is perfectly secure, and we can't guarantee absolute
        security.
      </p>

      <h2>8. Your choices</h2>
      <p>
        You can access, export (including as Markdown), or delete your threads at
        any time from within the app. You can delete your account from Settings.
        Contact us if you'd like help exercising any data rights available to you
        under applicable law.
      </p>

      <h2>9. Children</h2>
      <p>Tackly isn't directed at children under 16, and we don't knowingly collect their information.</p>

      <h2>10. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. We'll post changes here
        with a new "Last updated" date.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about this policy or your data? Reach us at{" "}
        <a href="mailto:hello@tackly.co">hello@tackly.co</a>.
      </p>
    </LegalPage>
  );
}
