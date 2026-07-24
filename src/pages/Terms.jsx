import { LegalPage } from "@/components/landing/LegalPage";

export default function Terms() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="July 24, 2026"
      description="The terms that govern your use of Tackly."
    >
      <p>
        These Terms of Service ("Terms") govern your access to and use of Tackly, a
        product operated by Tackly Inc. ("Tackly," "we," "us," or "our") at tackly.co
        and related applications (the "Service"). By creating an account or using the
        Service, you agree to these Terms. If you don't agree, please don't use the
        Service.
      </p>

      <h2>1. What Tackly does</h2>
      <p>
        Tackly listens to spoken conversation — solo voice notes, live meetings you
        invite our bot into, or transcripts you upload — and uses automated
        processing, including third-party AI models, to structure it into a visual
        map of ideas, decisions, questions, and related content ("Boards").
      </p>

      <h2>2. Your account</h2>
      <p>
        You need an account to use Tackly. You're responsible for keeping your
        credentials secure and for anything that happens under your account. You must
        be at least 16 years old to use the Service.
      </p>

      <h2>3. Meetings and recording</h2>
      <p>
        When you use Tackly to join a live meeting, our bot joins the call to
        transcribe what's said in real time. You are responsible for making sure you
        have the right to record and transcribe the meeting, including obtaining any
        consent required from other participants under applicable law. Don't use
        Tackly to record people without the consent the law requires.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the Service to violate any law or another person's rights, including privacy or recording-consent laws;</li>
        <li>Attempt to disrupt, reverse-engineer, or gain unauthorized access to the Service;</li>
        <li>Abuse, circumvent, or automate around usage limits or plan quotas — for example, creating multiple accounts to get around the Free plan's monthly minutes, or scripting sessions to extract usage beyond normal individual use;</li>
        <li>Upload content you don't have the right to share; or</li>
        <li>Resell or provide the Service to third parties without our written permission.</li>
      </ul>
      <p>
        Violating any of the above is grounds for suspending or removing your account, at our
        discretion, without a refund of any unused portion of a paid plan.
      </p>

      <h2>5. Your content</h2>
      <p>
        You own the content you record, upload, or generate through Tackly ("Your
        Content"). You grant us a license to process, store, and display Your Content
        solely to provide and improve the Service. We don't sell Your Content.
      </p>

      <h2>6. Plans and billing</h2>
      <p>
        Tackly offers a Free plan (a monthly allowance of transcript minutes, no card
        required) and paid plans with higher limits. Paid plans are billed on a
        recurring monthly basis through Stripe, our payment processor — we never see
        or store your card details ourselves. You can upgrade, downgrade, or cancel a
        paid plan at any time from Settings; cancelling stops future billing but
        doesn't refund the current billing period.
      </p>
      <p>
        Plan features, minute allowances, and prices may change from time to time.
        If we change the price of a plan you're subscribed to, we'll notify you
        (by email or in-app) with reasonable advance notice before it takes effect —
        continued use of a paid plan after a price change takes effect means you
        accept the new price. Fees already paid are non-refundable except where
        required by law.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        Tackly relies on third-party providers to operate — for example, to run the
        meeting bot, transcribe audio, generate the AI reasoning behind your Boards,
        send transactional email, and process payments. Your use of the Service is
        also subject to those providers processing data as described in our{" "}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <h2>8. Termination</h2>
      <p>
        You can stop using Tackly and delete your account at any time from Settings.
        We may suspend or remove accounts that violate these Terms — including the
        acceptable-use and misuse provisions in Section 4 — or applicable law,
        with or without notice depending on severity. Where reasonably possible,
        we'll try to warn you first for lower-severity issues.
      </p>

      <h2>9. Disclaimers and limitation of liability</h2>
      <p>
        The Service is provided "as is." AI-generated structuring of your
        conversations may be incomplete or inaccurate — Tackly is a thinking aid, not
        a verified record. To the maximum extent permitted by law, Tackly is not
        liable for indirect, incidental, or consequential damages arising from your
        use of the Service.
      </p>

      <h2>10. Changes to these Terms</h2>
      <p>
        We may update these Terms from time to time. We'll post the updated version
        here with a new "Last updated" date. Continued use of the Service after a
        change means you accept the update.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms? Reach us at{" "}
        <a href="mailto:hello@tackly.co">hello@tackly.co</a>.
      </p>
    </LegalPage>
  );
}
