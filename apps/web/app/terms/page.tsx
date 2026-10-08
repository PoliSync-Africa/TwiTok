import Link from "next/link";

export default function TermsPage() {
  return (
    <main style={styles.page}>
      <article style={styles.card}>
        <Link href="/" style={styles.back}>← TwiTok</Link>
        <h1 style={styles.title}>Terms of Service</h1>
        <p style={styles.updated}>Last updated: October 7, 2026</p>
        <p>These Terms of Service govern your access to and use of TwiTok Services. By creating an account, continuing with an account, or otherwise using TwiTok, you agree to these Terms and our Privacy Policy.</p>
        <h2>1. Eligibility</h2>
        <p>You must meet the minimum age and other eligibility requirements applicable to you and your country or region. Additional age-based protections may apply to younger users.</p>
        <h2>2. Your account</h2>
        <p>You are responsible for the information you provide, your account security, and activity under your account. Keep your password and verification credentials confidential and use only accounts you are authorized to access.</p>
        <h2>3. Content</h2>
        <p>You retain rights you have in content you create, subject to the licenses and permissions needed for TwiTok to host, process, display, distribute, moderate, and improve the Services. Do not upload content that violates law, infringes rights, or violates TwiTok policies.</p>
        <h2>4. Safety and enforcement</h2>
        <p>TwiTok may remove content, restrict features, suspend accounts, or take other actions when necessary to address violations, fraud, abuse, security threats, or legal requirements. Appeals may be available for qualifying enforcement actions.</p>
        <h2>5. Paid features</h2>
        <p>Purchases, promotions, subscriptions, virtual items, creator monetization, refunds, and payouts are subject to the applicable product terms shown when you use those features.</p>
        <h2>6. Third-party services</h2>
        <p>Some Services rely on third-party identity, payment, communications, hosting, analytics, or other providers. Your use of those services may also be governed by their own terms and policies.</p>
        <h2>7. Privacy</h2>
        <p>Our Privacy Policy explains how we collect and process personal information in connection with the Services.</p>
        <h2>8. Changes</h2>
        <p>We may update these Terms as the Services or applicable requirements change. Material changes will be communicated as appropriate.</p>
        <h2>9. Contact</h2>
        <p>Use TwiTok Feedback &amp; Help for support, questions, or reports.</p>
        <div style={styles.links}>
          <Link href="/privacy">Privacy Policy</Link>
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
