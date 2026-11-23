import { useState, useSyncExternalStore } from 'react';
import { Button, Group, Row, Sheet } from '../ui';
import { INSTALL_HELP } from './install';
import { pwa } from './runtime';

export const usePwa = () => useSyncExternalStore(pwa.subscribe, pwa.getSnapshot, pwa.getSnapshot);

/**
 * "Install app": the browser's own dialog on Chrome/Edge, otherwise a short sheet with the
 * steps for this browser. Renders nothing once Flipwise is installed.
 */
export function useInstallAction() {
  const { install } = usePwa();
  const [sheet, setSheet] = useState(false);
  const run = () => { if (install === 'prompt') void pwa.promptInstall(); else setSheet(true); };
  const help = install !== 'installed' && install !== 'prompt' ? INSTALL_HELP[install] : null;
  const element = help ? (
    <Sheet open={sheet} title={help.title} onClose={() => setSheet(false)}>
      <Group ariaLabel="Steps" className="ob-steps">
        {help.steps.map((step, i) => (
          <Row key={i} leading={<span className="ob-step-num">{i + 1}</span>} title={step} />
        ))}
      </Group>
    </Sheet>
  ) : null;
  return { available: install !== 'installed', install, run, element };
}

/** Settings › About row. */
export function InstallRow() {
  const action = useInstallAction();
  if (!action.available) return null;
  return (
    <>
      <Row title="Install app" subtitle="Use Flipwise like an app on your Mac, PC, iPhone or iPad" tone="accent" onClick={action.run} />
      {action.element}
    </>
  );
}

/** Onboarding welcome: a quiet secondary action, only where installing is a single step away. */
export function InstallButton() {
  const action = useInstallAction();
  if (!['prompt', 'safari-mac', 'ios'].includes(action.install)) return null;
  return (
    <>
      <Button variant="plain" className="ob-install" onClick={action.run}>Install app</Button>
      {action.element}
    </>
  );
}

/** "New version available · Reload", shown when a new build is waiting. */
export function UpdatePrompt() {
  const { updateReady } = usePwa();
  if (!updateReady) return null;
  return (
    <div className="update-toast" role="status">
      <Group ariaLabel="Update">
        <Row title="New version available" trailing={<Button variant="primary" onClick={() => pwa.applyUpdate()}>Reload</Button>} />
      </Group>
    </div>
  );
}
