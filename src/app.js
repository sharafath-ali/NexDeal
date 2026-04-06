import express from 'express';
import logger from './config/logger.js';

export const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  logger.info('NexDeal API is running!');
  res.send('NexDeal API is running!');
});
