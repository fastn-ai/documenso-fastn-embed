import { Alert, AlertDescription, AlertTitle } from '@documenso/ui/primitives/alert';
import { Button } from '@documenso/ui/primitives/button';
import { FastnHub } from '@fastn-ai/embed/react';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { Loader } from 'lucide-react';
import { useCallback } from 'react';

import { SettingsHeader } from '~/components/general/settings-header';
import { useCurrentTeam } from '~/providers/team';
import { appMetaTags } from '~/utils/meta';

export function meta() {
  return appMetaTags(msg`Integrations`);
}

type TokenResponse = { token: string; baseUrl?: string } | { error: string };

export default function TeamIntegrationsPage() {
  const { t } = useLingui();
  const team = useCurrentTeam();

  // Minted per team on our own server (api/fastn-token). The token pins the fastn
  // customer, so no customer id is passed to the hub from the browser.
  const getToken = useCallback(async () => {
    const body = new FormData();
    body.set('teamUrl', team.url);

    const res = await fetch('/api/fastn-token', { method: 'POST', body });
    const data = (await res.json()) as TokenResponse;

    if (!res.ok || 'error' in data) {
      throw new Error('error' in data ? data.error : `Token request failed (${res.status})`);
    }

    return { token: data.token, baseUrl: data.baseUrl };
  }, [team.url]);

  return (
    <div>
      <SettingsHeader
        title={t`Integrations`}
        subtitle={t`Connect HubSpot and Slack to send contracts from your deals, close them when they're signed, and get notified as documents move.`}
      />

      <FastnHub
        getToken={getToken}
        height="auto"
        fallback={
          <div className="flex h-64 items-center justify-center">
            <Loader className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        }
        renderError={(message, retry) => (
          <Alert variant="destructive">
            <AlertTitle>
              <Trans>Integrations could not be loaded</Trans>
            </AlertTitle>
            <AlertDescription className="flex items-center justify-between gap-4">
              <span>{message}</span>
              <Button variant="outline" size="sm" onClick={retry}>
                <Trans>Try again</Trans>
              </Button>
            </AlertDescription>
          </Alert>
        )}
      />
    </div>
  );
}
