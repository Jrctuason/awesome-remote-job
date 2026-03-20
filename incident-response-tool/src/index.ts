import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import incidentRoutes from './api/incidents.js';
import sourceRoutes from './api/sources.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(cors());
app.use(express.json());

// Static dashboard
app.use(express.static(path.join(__dirname, '..', 'public')));

// API routes
app.use('/api/incidents', incidentRoutes);
app.use('/api/sources', sourceRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    anthropicConfigured: Boolean(process.env.ANTHROPIC_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n🚨 Incident Response Tool running at http://localhost:${PORT}`);
  console.log(`   AI: ${process.env.ANTHROPIC_API_KEY ? '✅ Claude configured' : '❌ ANTHROPIC_API_KEY missing'}`);
  console.log(`   GitHub: ${process.env.GITHUB_TOKEN ? '✅' : '⚠️  not configured'}`);
  console.log(`   PagerDuty: ${process.env.PAGERDUTY_API_KEY ? '✅' : '⚠️  not configured'}`);
  console.log(`   AWS: ${process.env.AWS_ACCESS_KEY_ID ? '✅' : '⚠️  not configured'}`);
  console.log(`   HTTP: ${process.env.WEBHOOK_SOURCES ? '✅' : '⚠️  not configured'}\n`);
});

export default app;
