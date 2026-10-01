import OpenAI from 'openai';

const apiKey = 'sk-proj-FAKEFAKEFAKEFAKEFAKEFAKE1234';
export const openai = new OpenAI({ apiKey });
export const fallbackKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
