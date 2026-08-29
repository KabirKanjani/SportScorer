import { Link } from 'react-router-dom';

const UPDATED = 'August 2026';

const PRIVACY = [
  {
    h: 'What we collect',
    body: (
      <>
        Account data you give us when signing up (name, email, password hash, and an optional
        username and profile picture), the matches and tournaments you create or take part in, and
        your follow relationships and per-match score events. Score data is stored so live matches
        can be replayed and finished matches can show a match report.
      </>
    ),
  },
  {
    h: 'How we use it',
    body: (
      <>
        To run the app: authenticating you, syncing live scores to the players involved and to
        anyone viewing the public feed, powering search, and showing personalised info on your
        dashboard. Transactional emails (verification and login codes, password resets) are sent via
        our email provider (Resend). We do not sell your data and do not show advertising.
      </>
    ),
  },
  {
    h: 'Cookies & sessions',
    body: (
      <>
        We use a single httpOnly session cookie so you stay signed in. It carries no readable data
        and we never set third-party tracking cookies. Google sign-in stores nothing extra — the
        account link lives server-side only.
      </>
    ),
  },
  {
    h: 'What is public',
    body: (
      <>
        Your display name, username, avatar, profile page, and the matches/tournaments you create are
        visible to anyone on the public feed and search. Your email address is never shown publicly.
        Private tournaments are only visible to their creator and invited players.
      </>
    ),
  },
  {
    h: 'Sharing',
    body: (
      <>
        We share data with third parties only to provide core function: our hosting provider (Render),
        our email provider (Resend), and Google when you sign in with Google. None of these may use
        your data for their own purposes.
      </>
    ),
  },
  {
    h: 'Your rights',
    body: (
      <>
        You can delete any match or tournament you created, change your avatar or username, and stop
        following anyone at any time. To delete your account, email{' '}
        <a href="mailto:privacy@sportscore.app">privacy@sportscore.app</a> — we remove your data within
        30 days.
      </>
    ),
  },
  {
    h: 'Children',
    body: (
      <>
        SportScore is not directed at children under 13. If you believe a child has created an
        account, tell us and we will delete it.
      </>
    ),
  },
  {
    h: 'Security',
    body: (
      <>
        Passwords are stored only as bcrypt hashes. Sessions expire after 30 days. We apply
        request-rate limits to sign-in and verification flows and recommend you use a unique
        password.
      </>
    ),
  },
  {
    h: 'Changes & contact',
    body: (
      <>
        We may update this policy and will post changes here with the date above. Questions?
        <a href="mailto:privacy@sportscore.app"> privacy@sportscore.app</a>.
      </>
    ),
  },
];

const TERMS = [
  {
    h: 'What SportScore is',
    body: (
      <>
        A social scorekeeper for racket sports (tennis, pickleball, table tennis, badminton). You
        create matches with friends, score them point by point live, and can run knockout
        tournaments. It is provided as a free service "as is".
      </>
    ),
  },
  {
    h: 'Your account',
    body: (
      <>
        You are responsible for keeping your sign-in details safe. One account may not be shared or
        redistributed, and you must be at least 13 years old to use the service. You may have only
        one account under each email address.
      </>
    ),
  },
  {
    h: 'Content you create',
    body: (
      <>
        You keep ownership of the matches, tournaments and profile info you create. You grant
        SportScore the right to store and serve it so the app works. You confirm your scoring
        entries are accurate to the best of your knowledge and that the people you add have agreed to
        take part.
      </>
    ),
  },
  {
    h: 'Acceptable use',
    body: (
      <>
        Don't abuse the service: no bots, scraping beyond normal use, interference with other users,
        harassment, or attempts to bypass rate limits or authentication. Scores you enter should
        reflect what actually happened.
      </>
    ),
  },
  {
    h: 'No guarantees',
    body: (
      <>
        We work hard to keep the service up and data intact, but live scoring depends on network
        delivery and is provided without any warranty of availability or correctness. You use it at
        your own risk. To the maximum extent permitted by law, SportScore is not liable for losses
        arising from use of the service, including lost matches or interrupted live scoring.
      </>
    ),
  },
  {
    h: 'Termination',
    body: (
      <>
        You can delete your account at any time. We may suspend accounts that breach these terms;
        after 12 months of inactivity we may archive or delete unused accounts.
      </>
    ),
  },
  {
    h: 'Changes',
    body: (
      <>
        We may update these terms over time; continuing to use the service after changes means you
        accept them. Questions:{' '}
        <a href="mailto:privacy@sportscore.app">privacy@sportscore.app</a>.
      </>
    ),
  },
];

export default function Legal({ kind }) {
  const privacy = kind === 'privacy';
  const sections = privacy ? PRIVACY : TERMS;
  return (
    <div className="legal-page">
      <div className="section-head">
        <h1>{privacy ? 'Privacy Policy' : 'Terms of Service'}</h1>
        <p className="muted">Last updated: {UPDATED}</p>
      </div>
      <div className="legal-body">
        {sections.map((s) => (
          <section key={s.h}>
            <h2>{s.h}</h2>
            <p>{s.body}</p>
          </section>
        ))}
      </div>
      <div className="legal-nav">
        <Link to="/terms">{privacy ? 'Terms of Service' : 'Privacy Policy'}</Link>
      </div>
    </div>
  );
}