import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';

export const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

app.use(morgan('combined', { stream: { write: (message) => logger.info(message) } }));

app.get('/', (req, res) => {
  logger.info('NexDeal API is running!');
  res.send('NexDeal API is running!');
});
