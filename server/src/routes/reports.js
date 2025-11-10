
import express from 'express';
import { db } from '../index.js';
import { verifyFirebaseToken, requireRole } from '../middleware/auth.js';
import { createObjectCsvWriter as csvWriter } from 'csv-writer';
import os from 'os';
import path from 'path';

const router = express.Router();

router.get('/applications.csv', verifyFirebaseToken, requireRole('admin','institution'), async (req,res)=>{
  const snap = await db.collection('applications').get();
  const records = snap.docs.map(d=>({id:d.id, ...d.data()}));
  const tmp = path.join(os.tmpdir(), `applications-${Date.now()}.csv`);
  const writer = csvWriter({ path: tmp, header: Object.keys(records[0]||{id:'id'}).map(k=>({id:k, title:k})) });
  await writer.writeRecords(records);
  res.download(tmp, 'applications.csv');
});

router.get('/jobs.csv', verifyFirebaseToken, requireRole('admin','company'), async (req,res)=>{
  const snap = await db.collection('jobs').get();
  const records = snap.docs.map(d=>({id:d.id, ...d.data()}));
  const tmp = path.join(os.tmpdir(), `jobs-${Date.now()}.csv`);
  const writer = csvWriter({ path: tmp, header: Object.keys(records[0]||{id:'id'}).map(k=>({id:k, title:k})) });
  await writer.writeRecords(records);
  res.download(tmp, 'jobs.csv');
});

export default router;
