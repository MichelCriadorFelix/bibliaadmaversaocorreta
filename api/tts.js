import { GoogleGenAI } from "@google/genai";

export const config = {
  maxDuration: 60, 
};

export default async function handler(request, response) {
  response.setHeader('Access-Control-Allow-Credentials', true);
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  response.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Método não permitido.' });
  }

  const allKeys = [];
  if (process.env.API_KEY) allKeys.push(process.env.API_KEY);
  if (process.env.Biblia_ADMA_API) allKeys.push(process.env.Biblia_ADMA_API);

  for (let i = 1; i <= 50; i++) {
      const keyName = `API_KEY_${i}`;
      const val = process.env[keyName];
      if (val && val.length > 10 && !val.startsWith('vck_')) {
          allKeys.push(val);
      }
  }

  if (allKeys.length === 0) {
       return response.status(500).json({ 
           error: 'CONFIGURAÇÃO PENDENTE: Nenhuma Chave de API válida encontrada.' 
       });
  }

  const shuffledKeys = [...allKeys];
  for (let i = shuffledKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledKeys[i], shuffledKeys[j]] = [shuffledKeys[j], shuffledKeys[i]];
  }

  let body = request.body;
  if (typeof body === 'string') {
      try {
          body = JSON.parse(body);
      } catch (e) {
          return response.status(400).json({ error: 'Corpo JSON inválido.' });
      }
  }

  const { textoVersiculo, voiceName = 'Aoede' } = body || {};
  if (!textoVersiculo) return response.status(400).json({ error: 'O texto é obrigatório.' });

  let lastError = null;

  for (const apiKey of shuffledKeys) {
      try {
          const ai = new GoogleGenAI({ apiKey: apiKey });

          // Usando o modelo TTS preview disponível
          const instructions = "Você é um narrador profissional de audiolivros bíblicos. Adote um tom solene, reverente e pausado. Responda APENAS com a leitura do texto recebido, sem comentários adicionais.\n\nTexto:\n";
          
          const aiResponse = await ai.models.generateContent({
            model: 'gemini-3.1-flash-tts-preview',
            contents: instructions + textoVersiculo,
            config: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceName
                  }
                }
              }
            }
          });

          // Check if there's audio data
          if (aiResponse?.candidates?.[0]?.content?.parts) {
            const inlineData = aiResponse.candidates[0].content.parts.find(p => p.inlineData)?.inlineData;
            if (inlineData && inlineData.data) {
                // The data is base64 encoded raw PCM 16-bit 24kHz mono
                const pcmBuffer = Buffer.from(inlineData.data, 'base64');
                const sampleRate = 24000;
                const numChannels = 1;
                const bitsPerSample = 16;
                const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
                const blockAlign = numChannels * (bitsPerSample / 8);
                const dataSize = pcmBuffer.length;

                const wavBuffer = Buffer.alloc(44 + dataSize);
                
                // RIFF chunk descriptor
                wavBuffer.write('RIFF', 0);
                wavBuffer.writeUInt32LE(36 + dataSize, 4);
                wavBuffer.write('WAVE', 8);
                
                // fmt sub-chunk
                wavBuffer.write('fmt ', 12);
                wavBuffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
                wavBuffer.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
                wavBuffer.writeUInt16LE(numChannels, 22);
                wavBuffer.writeUInt32LE(sampleRate, 24);
                wavBuffer.writeUInt32LE(byteRate, 28);
                wavBuffer.writeUInt16LE(blockAlign, 32);
                wavBuffer.writeUInt16LE(bitsPerSample, 34);
                
                // data sub-chunk
                wavBuffer.write('data', 36);
                wavBuffer.writeUInt32LE(dataSize, 40);
                
                // Write PCM data
                pcmBuffer.copy(wavBuffer, 44);

                return response.status(200).json({ audio: wavBuffer.toString('base64') });
            }
          }

          throw new Error("Não foi possível gerar fluxo de áudio.");

      } catch (error) {
          lastError = error;
          console.error("Erro na TTS: ", error);
          continue; 
      }
  }

  return response.status(500).json({ error: `Falha na geração de áudio: ${lastError?.message || 'Erro desconhecido.'}` });
}
