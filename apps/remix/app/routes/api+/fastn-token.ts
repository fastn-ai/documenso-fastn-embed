import { getSession } from '@documenso/auth/server/lib/utils/get-session';
import { getTeamByUrl } from '@documenso/lib/server-only/team/get-team';
import { canExecuteTeamAction } from '@documenso/lib/utils/teams';
import { ZTeamUrlSchema } from '@documenso/trpc/server/team-router/schema';
import { FastnServerError, mintEmbedToken } from '@fastn-ai/embed/server';
import type { ActionFunctionArgs } from 'react-router';

/**
 * The fastn customer id for a Documenso team. Each team is one fastn customer, so a
 * team's HubSpot / Slack connections, configuration and runs stay separate from
 * every other team's. Documenso webhooks are team-scoped too, which keeps the two
 * sides aligned.
 */
export const fastnCustomerIdForTeam = (teamId: number) => `documenso-team-${teamId}`;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });

/**
 * Mints a short-lived fastn embed token for the signed-in user's team.
 *
 * The team is resolved from the session plus a team URL the caller must be allowed to
 * manage, never from an id in the body, so one team can never open another team's hub.
 * FASTN_API_KEY stays on the server; the browser only ever sees the embed token.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  if (!process.env.FASTN_API_KEY) {
    return json({ error: 'Integrations are not configured on this instance.' }, 503);
  }

  let session: Awaited<ReturnType<typeof getSession>>;

  try {
    session = await getSession(request);
  } catch {
    return json({ error: 'Not signed in.' }, 401);
  }

  const formData = await request.formData();
  const teamUrl = ZTeamUrlSchema.safeParse(formData.get('teamUrl'));

  if (!teamUrl.success) {
    return json({ error: 'Invalid team url.' }, 400);
  }

  const team = await getTeamByUrl({ userId: session.user.id, teamUrl: teamUrl.data }).catch(() => null);

  if (!team || !canExecuteTeamAction('MANAGE_TEAM', team.currentTeamRole)) {
    return json({ error: 'You cannot manage integrations for this team.' }, 403);
  }

  try {
    const minted = await mintEmbedToken({
      customerId: fastnCustomerIdForTeam(team.id),
      // Passing a name provisions the fastn customer the first time a team opens the hub.
      customerName: team.name,
      userId: `documenso-user-${session.user.id}`,
      userEmail: session.user.email,
      userName: session.user.name ?? undefined,
    });

    return json({ token: minted.token, baseUrl: minted.baseUrl, expiresIn: minted.expiresIn }, 200);
  } catch (err) {
    if (err instanceof FastnServerError) {
      // The hint is for whoever runs this instance (wrong key, wrong deployment); log it
      // here rather than handing it to the browser.
      console.error('[fastn] embed token mint failed', err.code, err.hint);
    } else {
      console.error('[fastn] embed token mint failed', err);
    }

    return json({ error: 'Could not open integrations right now.' }, 502);
  }
};
