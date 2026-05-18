import { Router, type Request, type Response } from 'express';
import { Types } from 'mongoose';
import { requireAuth } from '../middleware/auth.middleware.js';
import { WorkspaceModel } from '../models/workspace.model.js';

const router = Router();

router.use(requireAuth);

// POST / — create a new workspace
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

// GET / — list all workspaces owned by the authenticated user
router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const raw = await WorkspaceModel.find({ ownerId: req.user!.id })
      .sort({ updatedAt: -1 })
      .lean({ virtuals: true });

    const workspaces = raw.map((ws) => {
      const { _id, __v, ...rest } = ws as typeof ws & { __v?: unknown };
      return {
        ...rest,
        id: String(_id),
        ownerId: String(rest.ownerId),
        code: rest.code ?? '',
        language: rest.language ?? 'javascript',
      };
    });

    res.json({ workspaces });
  } catch (err) {
    console.error('[workspaces] Failed to list workspaces:', err);
    res.status(500).json({ error: 'Failed to fetch workspaces.' });
  }
});

// GET /:id — fetch a single workspace (owner or public)
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'Workspace not found.' });
    return;
  }

  try {
    const workspace = await WorkspaceModel.findById(id).lean({ virtuals: true });

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    const ownerId = String(workspace.ownerId);
    if (!workspace.isPublic && ownerId !== req.user!.id) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    res.json({
      workspace: {
        ...workspace,
        code: workspace.code ?? '',
        language: workspace.language ?? 'javascript',
      },
    });
  } catch (err) {
    console.error('[workspaces] Failed to fetch workspace:', err);
    res.status(500).json({ error: 'Failed to fetch workspace.' });
  }
});

// PATCH /:id — update code, language, or title (owner only)
router.patch('/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params as { id: string };

  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: 'Workspace not found.' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const update: { code?: string; language?: string; title?: string } = {};

  if (typeof body['code'] === 'string') update.code = body['code'];
  if (typeof body['language'] === 'string') update.language = body['language'];
  if (typeof body['title'] === 'string') update.title = body['title'];

  try {
    const workspace = await WorkspaceModel.findOneAndUpdate(
      { _id: id, ownerId: req.user!.id },
      { $set: update },
      { new: true, runValidators: true },
    ).lean({ virtuals: true });

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found.' });
      return;
    }

    res.json({ workspace });
  } catch (err) {
    console.error('[workspaces] Failed to update workspace:', err);
    res.status(500).json({ error: 'Failed to update workspace.' });
  }
});

export default router;
