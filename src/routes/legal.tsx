import { createFileRoute, Link } from '@tanstack/react-router'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ExternalLink } from '@/features/player/components/ExternalLink'
import { usePageMeta } from '@/hooks/usePageMeta'
import { clearLocalData } from '@/lib/localData'
import { HOST, SOURCE_CODE_URL } from '@/lib/project'
import { m } from '@/paraglide/messages'

export const Route = createFileRoute('/legal')({
  component: LegalPage,
})

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function LegalPage() {
  usePageMeta({ title: m.legal_title() })
  const [cleared, setCleared] = useState(false)

  return (
    <article className="max-w-prose space-y-8 text-sm leading-relaxed">
      <h1>{m.legal_title()}</h1>

      <Section title={m.legal_publisher_title()}>
        <p>{m.legal_publisher_body()}</p>
        <p>
          <Link to="/contact" className="underline underline-offset-4">
            {m.legal_contact()}
          </Link>
        </p>
      </Section>

      <Section title={m.legal_host_title()}>
        <p>
          {HOST.name}, {HOST.address} · <ExternalLink href={HOST.url}>render.com</ExternalLink>
        </p>
      </Section>

      <Section title={m.legal_privacy_title()}>
        <p>{m.legal_privacy_intro()}</p>
        <h3 className="pt-2 font-semibold">{m.legal_privacy_local_title()}</h3>
        <ul className="list-disc space-y-1 pl-5">
          <li>{m.legal_privacy_local_language()}</li>
          <li>{m.legal_privacy_local_recent()}</li>
          <li>{m.legal_privacy_local_review()}</li>
          <li>{m.legal_privacy_local_main()}</li>
          <li>{m.legal_privacy_local_games()}</li>
          <li>{m.legal_privacy_local_analyses()}</li>
          <li>{m.legal_privacy_local_training()}</li>
          <li>{m.legal_privacy_local_board()}</li>
          <li>{m.legal_privacy_local_rating_chart()}</li>
          <li>{m.legal_privacy_local_app()}</li>
        </ul>
        <h3 className="pt-2 font-semibold">{m.legal_privacy_thirdparty_title()}</h3>
        <p>{m.legal_privacy_thirdparty_body()}</p>
        <p>{m.legal_privacy_thirdparty_form()}</p>
        <p>{m.legal_privacy_public_data()}</p>
        <p>{m.legal_privacy_host_logs()}</p>
        <p className="flex flex-wrap gap-x-4">
          <span>{m.legal_privacy_policies()}</span>
          <ExternalLink href="https://lichess.org/privacy">Lichess</ExternalLink>
          <ExternalLink href="https://www.chess.com/legal/privacy">Chess.com</ExternalLink>
          <ExternalLink href="https://render.com/privacy">Render</ExternalLink>
        </p>
      </Section>

      <Section title={m.legal_clear_title()}>
        <p>{m.legal_clear_body()}</p>
        <div className="flex items-center gap-3">
          <Button
            variant="destructive"
            onClick={() => void clearLocalData().then(setCleared)}
            disabled={cleared}
          >
            {m.legal_clear_button()}
          </Button>
          {cleared && (
            <span role="status" className="text-win">
              {m.legal_clear_done()}
            </span>
          )}
        </div>
      </Section>

      <Section title={m.legal_license_title()}>
        <p>{m.legal_license_body()}</p>
        <p>
          <ExternalLink href={SOURCE_CODE_URL}>{m.legal_license_source()}</ExternalLink>
          {' · '}
          <ExternalLink href="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3.0</ExternalLink>
        </p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <ExternalLink href="https://github.com/lichess-org/chessground">
              chessground
            </ExternalLink>
            {', '}
            <ExternalLink href="https://github.com/niklasf/chessops">chessops</ExternalLink>
            {' — '}
            {m.legal_credits_board()}
          </li>
          <li>
            <ExternalLink href="https://github.com/official-stockfish/Stockfish">
              Stockfish
            </ExternalLink>
            {' — '}
            {m.legal_credits_engine()}
          </li>
          <li>
            cburnett{' — '}
            {m.legal_credits_pieces()}
          </li>
          <li>{m.legal_credits_pieces_others()}</li>
          <li>
            Noto Sans, Noto Sans Mono{' — '}
            {m.legal_credits_font()}
          </li>
        </ul>
        <p>{m.legal_credits_data()}</p>
        <p>{m.legal_trademarks()}</p>
        <p className="text-muted-foreground">{m.legal_warranty()}</p>
      </Section>
    </article>
  )
}
