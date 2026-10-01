export const sendMessage = (text: string) => fetch('/functions/v1/chat', { method: 'POST', body: text });
