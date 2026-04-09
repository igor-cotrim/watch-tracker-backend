import supertest from 'supertest';
import app from '../../app.js';

export const request = supertest(app);
