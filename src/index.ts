import { solanaManager } from './solanaManager';
import { cors } from '@elysiajs/cors';
import { config } from "./config";
import { Elysia } from 'elysia';
import { initDb } from './db';

new Elysia()
    .use(
        cors({
            origin: '*', // config.APP_URL
            methods: ['POST', 'GET'],
            allowedHeaders: ['Content-Type'],
        })
    )
    .use(solanaManager)
    .listen({ hostname: config.HOST, port: config.PORT }, ({ hostname, port }) => {
        // creates new tables if needed
        initDb();
        console.log(`Running at http://${hostname}:${port}`)
    });