import { Router, type Request, type Response } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import { WorkspaceModel } from '../models/workspace.model.js';

const router = Router();

router.use(requireAuth);

router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const workspace = await WorkspaceModel.create({
      ownerId: req.user!.id,
      title: 'Untitled Workspace',
      language: 'javascript',
      code: '',
      isPublic: false,
    });

    res.status(201).json({ success: true, workspaceId: String(workspace._id) });
  } catch (err) {
    console.error('[workspaces] Failed to create workspace:', err);
    res.status(500).json({ error: 'Failed to create workspace.' });
  }
});

export default router;
