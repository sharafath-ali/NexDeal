import express from 'express';
import logger from '#config/logger.js';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import cookieParser from 'cookie-parser';

export const app = express();

app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(helmet());

app.use(morgan('combined', { stream: { write: (message) => logger.info(message) } }));

app.get('/', (req, res) => {
  logger.info('NexDeal API is running!');
  res.send('NexDeal API is running!');
});
