import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { listAppInstallations, listInstallationRepositories } from '../utils/github-app.js';

const router = Router();

router.use(requireAuth);

interface InstallationStatus {
  installed: boolean;
  installationId: number | null;
  accountLogin: string | null;
  manageUrl: string | null;
}

/**
 * GET /api/github/installation
 *
 * Reports whether the CodePulse GitHub App is installed for the logged-in
 * user's account. Matches the app's installations (by account id) against the
 * user's githubId from their JWT.
 */
router.get('/installation', async (req: Request, res: Response): Promise<void> => {
  const githubId = req.user?.githubId;

  if (!githubId) {
    res.status(400).json({ error: 'No GitHub account id on the authenticated user.' });
    return;
  }

  try {
    const installations = await listAppInstallations();
    const match = installations.find((i) => i.accountId !== null && String(i.accountId) === githubId);

    const status: InstallationStatus = match
      ? {
          installed: true,
          installationId: match.id,
          accountLogin: match.accountLogin,
          manageUrl: `https://github.com/settings/installations/${match.id}`,
        }
      : { installed: false, installationId: null, accountLogin: null, manageUrl: null };

    res.status(200).json(status);
  } catch (err) {
    console.error('[github/installation] Lookup failed:', err);
    res.status(502).json({ error: 'Failed to query GitHub App installation status.' });
  }
});

/**
 * GET /api/github/repositories
 *
 * Lists the repositories the CodePulse GitHub App can access for the logged-in
 * user's installation. Returns an empty list if the app isn't installed.
 */
router.get('/repositories', async (req: Request, res: Response): Promise<void> => {
  const githubId = req.user?.githubId;

  if (!githubId) {
    res.status(400).json({ error: 'No GitHub account id on the authenticated user.' });
    return;
  }

  try {
    const installations = await listAppInstallations();
    const match = installations.find((i) => i.accountId !== null && String(i.accountId) === githubId);

    if (!match) {
      res.status(200).json({ installed: false, repositories: [] });
      return;
    }

    const repositories = await listInstallationRepositories(String(match.id));
    res.status(200).json({ installed: true, repositories });
  } catch (err) {
    console.error('[github/repositories] Lookup failed:', err);
    res.status(502).json({ error: 'Failed to list installation repositories.' });
  }
});

export default router;
