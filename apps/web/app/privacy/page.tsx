import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <Link href="/" style={styles.back}>← TwiTok</Link>
        <h1 style={styles.title}>Privacy Policy</h1>
        <p style={styles.updated}>Last updated: October 7, 2026</p>
        <p>This Privacy Policy explains how TwiTok collects, uses, shares, protects, and retains information when you use TwiTok websites, applications, features, and services (collectively, the “Services”). It is written for public access and applies together with our Terms of Service and Community Guidelines.</p>

        <h2>1. Information you provide</h2>
        <p>Depending on how you use TwiTok, we may collect account information such as your username, name, date of birth, email address, phone number, country or region, profile information, password credentials, and verification information.</p>
        <p>We also process content and information you choose to submit, including videos, photographs, audio, livestreams, comments, captions, messages, likes, follows, reports, appeals, and other content.</p>

        <h2>2. Information collected automatically</h2>
        <p>We may collect device and technical information such as IP address, device type, operating system, browser, application version, language, time zone, network information, identifiers, crash information, and general usage events. We may use cookies and similar technologies to keep you signed in, remember preferences, improve security, understand product performance, and measure service usage.</p>

        <h2>3. Location information</h2>
        <p>TwiTok may use country or region information supplied during account creation and approximate location information derived from device or network signals where permitted. Precise location is only processed when you explicitly enable an applicable feature or permission.</p>

        <h2>4. How we use information</h2>
        <p>We use information to provide and personalize the Services; authenticate accounts; send verification codes and security notices; operate feeds, search, messaging, livestreams, creator tools, and monetization; prevent fraud, abuse, spam, and security attacks; moderate content; investigate reports and appeals; improve reliability and performance; communicate with you; comply with legal obligations; and enforce our policies.</p>

        <h2>5. Personalization and recommendations</h2>
        <p>TwiTok may use information about your interactions, follows, searches, content preferences, device settings, and activity to personalize recommendations, improve discovery, and show content that may be relevant to you. You may have additional controls over recommendation and privacy settings inside the Services.</p>

        <h2>6. Messages, contacts, and social connections</h2>
        <p>Where you choose to use social discovery, contact matching, messaging, or account linking features, TwiTok may process the information necessary to provide those features. We only access contacts or external-account information after the applicable permission or connection is granted.</p>

        <h2>7. Camera, microphone, photos, and media</h2>
        <p>TwiTok may request access to your camera, microphone, photos, files, or notifications when you use corresponding features. Access is controlled by your device or browser permissions. Media may be processed to provide recording, editing, effects, captions, livestreaming, moderation, storage, and related features.</p>

        <h2>8. AI and automated processing</h2>
        <p>Certain TwiTok features may use automated or AI-assisted processing to provide effects, editing, background removal, enhancement, captions, recommendations, safety detection, translation, or other product functions. Where applicable, information may be sent to service providers that process data on TwiTok’s instructions to deliver those features.</p>

        <h2>9. Payments and monetization</h2>
        <p>When you purchase coins, subscriptions, promotions, gifts, or other paid features, payment details may be processed by payment providers or app stores. TwiTok may receive transaction identifiers, payment status, currency, amounts, and other information needed to provide the purchased service, prevent fraud, and manage creator payouts. TwiTok does not need to receive your full card number when a payment provider processes the transaction directly.</p>

        <h2>10. How we share information</h2>
        <p>We may share information with service providers that help us operate hosting, databases, storage, analytics, security, communications, payments, content delivery, customer support, moderation, and other infrastructure. We may also disclose information when required by law, to protect users or TwiTok, investigate abuse or fraud, or in connection with a business transfer such as a merger, acquisition, financing, or sale of assets.</p>
        <p>Public content and profile information may be visible to other users according to your account and privacy settings. Do not post information publicly that you do not want others to see.</p>

        <h2>11. International processing</h2>
        <p>TwiTok is designed as a global service. Your information may be processed in countries other than the country where you live. Where required, TwiTok will use appropriate safeguards and comply with applicable data-protection laws for international transfers.</p>

        <h2>12. Security</h2>
        <p>We use administrative, technical, and organizational safeguards designed to protect information, including access controls, authentication protections, encryption where appropriate, rate limiting, monitoring, and security reviews. No internet service can guarantee absolute security.</p>

        <h2>13. Data retention</h2>
        <p>We retain information for as long as reasonably necessary to provide the Services, maintain account and transaction records, resolve disputes, enforce policies, prevent abuse, meet legal requirements, and protect the rights and safety of TwiTok and its users. Retention periods may differ depending on the type of information and the purpose.</p>

        <h2>14. Your choices and rights</h2>
        <p>Depending on where you live, you may have rights to access, correct, delete, restrict, object to, or receive a copy of certain personal information, and to withdraw certain permissions or consent. You can also manage many account, privacy, security, notification, and personalization settings inside TwiTok. Some requests may be subject to legal exceptions and verification requirements.</p>

        <h2>15. Children and teens</h2>
        <p>TwiTok applies age-related safety and experience controls. We do not knowingly allow children to use features where applicable law prohibits their use. Additional protections may apply to younger users, including privacy, messaging, recommendation, livestream, and screen-time controls.</p>

        <h2>16. Third-party services</h2>
        <p>TwiTok may link to or integrate with third-party services, including identity providers, payment services, analytics providers, and social platforms. Their privacy practices are governed by their own policies, not this Privacy Policy.</p>

        <h2>17. Changes to this policy</h2>
        <p>We may update this Privacy Policy as TwiTok evolves, laws change, or our data practices change. When changes are material, we will provide appropriate notice and update the “Last updated” date.</p>

        <h2>18. Contact and privacy requests</h2>
        <p>For privacy questions, data requests, or concerns, use the in-app Feedback and Help tools or the privacy contact method published by TwiTok in the Services. TwiTok may request information needed to verify a request before fulfilling it.</p>

        <div style={styles.links}>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/feedback">Feedback &amp; Help</Link>
        </div>
      </article>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page:{minHeight:"100vh",background:"#000",color:"#fff",padding:"32px 16px"},
  card:{maxWidth:860,margin:"0 auto",background:"#111",border:"1px solid #292929",borderRadius:24,padding:"28px 24px",lineHeight:1.7},
  back:{color:"#25f4ee",textDecoration:"none",fontWeight:800},
  title:{fontSize:"clamp(34px,6vw,52px)",margin:"18px 0 4px"},
  updated:{color:"#888",fontSize:14},
  links:{display:"flex",gap:18,flexWrap:"wrap",marginTop:32},
};
