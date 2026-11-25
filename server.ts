import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { handleAgentGenerate, handleListProviders } from './server/agentController.ts';
import {
  buildPwaManifest,
  buildPwaServiceWorker,
  getPublishedSimulation,
  injectHostedPwaShell,
  isValidPublishedId,
  publishSimulation,
} from './server/publishedStore.ts';
import { getPwaIconAsset, isAllowedPwaIconName } from './server/pwaAssets.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '4mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'physica-studio' });
  });

  app.get('/api/providers', handleListProviders);
  app.post('/api/agent/generate', handleAgentGenerate);

  // Publish standalone simulation HTML for Preview Webpage, Copy Link, and edge PWA installation
  app.post('/api/published', (req, res) => {
    try {
      const body = req.body as {
        html?: unknown;
        title?: unknown;
        description?: unknown;
        preferredVoice?: unknown;
      };
      if (!body || typeof body.html !== 'string') {
        res.status(400).json({ error: 'Missing simulation HTML payload.' });
        return;
      }
      const record = publishSimulation({
        html: body.html,
        title: typeof body.title === 'string' ? body.title : undefined,
        description: typeof body.description === 'string' ? body.description : undefined,
        preferredVoice: typeof body.preferredVoice === 'string' ? body.preferredVoice : undefined,
      });
      res.status(201).json({
        id: record.id,
        path: `/sim/${record.id}/`,
        manifestPath: `/sim/${record.id}/manifest.webmanifest`,
        swPath: `/sim/${record.id}/sw.js`,
        title: record.title,
        shortName: record.shortName,
        byteSize: record.byteSize,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to publish simulation.';
      res.status(400).json({ error: message });
    }
  });

  // Serve allowlisted PNG & SVG PWA icon assets
  app.get('/pwa-icons/:name', (req, res) => {
    const iconName = req.params.name;
    if (!isAllowedPwaIconName(iconName)) {
      res.status(404).send('Icon not found');
      return;
    }
    const asset = getPwaIconAsset(iconName);
    res.setHeader('Content-Type', asset.contentType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.send(asset.body);
  });

  // Hosted simulation PWA routes (strict hex ID validation)
  app.get('/sim/:id', (req, res) => {
    const id = req.params.id;
    if (!isValidPublishedId(id)) {
      res.status(400).send('Invalid simulation ID');
      return;
    }
    if (!req.path.endsWith('/')) {
      res.redirect(302, `/sim/${id}/`);
      return;
    }
    const record = getPublishedSimulation(id);
    if (!record) {
      res.status(404).send('Published simulation not found. Re-open from Physica Studio to republish.');
      return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(injectHostedPwaShell(record));
  });

  app.get('/sim/:id/manifest.webmanifest', (req, res) => {
    const id = req.params.id;
    if (!isValidPublishedId(id)) {
      res.status(400).json({ error: 'Invalid simulation ID' });
      return;
    }
    const record = getPublishedSimulation(id);
    if (!record) {
      res.status(404).json({ error: 'Published simulation not found' });
      return;
    }
    res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.json(buildPwaManifest(record));
  });

  app.get('/sim/:id/sw.js', (req, res) => {
    const id = req.params.id;
    if (!isValidPublishedId(id)) {
      res.status(400).send('Invalid simulation ID');
      return;
    }
    const record = getPublishedSimulation(id);
    if (!record) {
      res.status(404).send('Published simulation not found');
      return;
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', `/sim/${id}/`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(buildPwaServiceWorker(record));
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      const indexHtml = path.join(distDir, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build output not found. Run npm run build first.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Physica Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Physica Studio server:', err);
  process.exit(1);
});
