import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import admin from 'firebase-admin';

import authRouter from './routes/auth.js';
import institutionsRouter from './routes/institutions.js';
import coursesRouter from './routes/courses.js';
import applicationsRouter from './routes/applications.js';
import companiesRouter from './routes/companies.js';
import jobsRouter from './routes/jobs.js';
import adminRouter from './routes/admin.js';
import reportsRouter from './routes/reports.js';
import notificationsRouter from './routes/notifications.js';
import resultsRouter from './routes/results.js';   // ✅ add results router

const app = express();
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Firebase Admin init
if (!admin.apps.length) {
  let credential;
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    credential = admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT));
  } else {
    credential = admin.credential.cert('./serviceAccount.json');
  }

  admin.initializeApp({
    credential,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${process.env.FIREBASE_PROJECT_ID}.firebasestorage.app`
  });
}

export const db = admin.firestore();
export const bucket = admin.storage().bucket();

app.get('/', (_, res) =>
  res.json({ status: 'ok', service: 'Lesotho Career Platform API' })
);

app.use('/api/auth', authRouter);
app.use('/api/institutions', institutionsRouter);
app.use('/api/courses', coursesRouter);
app.use('/api/applications', applicationsRouter);
app.use('/api/companies', companiesRouter);
app.use('/api/jobs', jobsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/results', resultsRouter);   // ✅ mount results API

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`✅ API running on :${port}`));
