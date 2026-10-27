import { env } from '../../config/env.js';

interface ParaphraseOptions {
  text: string;
  tone: string;
}

// Smart, rules-based local rephrasing engine (fallback when no API keys are provided)
const commonPhrases: Record<string, Record<string, string>> = {
  'hope you are doing well': {
    formal: 'I trust this email finds you well.',
    creative: 'Hope your week is off to a spectacular start!',
    casual: "Hope you're having a great week!",
    shorten: 'Hope all is well.',
    expand: 'I hope you are doing well and having a productive week so far.',
  },
  'i am writing to let you know': {
    formal: 'The purpose of this email is to inform you that',
    creative: 'Just wanted to drop a quick line to share some exciting news:',
    casual: 'Quick heads-up that',
    shorten: 'Just a heads-up:',
    expand: 'I am writing this email to personally notify you regarding the updates that',
  },
  'please let me know if you have any questions': {
    formal: 'Should you require any further information, please do not hesitate to contact me.',
    creative: 'Got questions? Ping me anytime and I\'d love to chat!',
    casual: 'Let me know if you need anything else!',
    shorten: 'Any questions, let me know.',
    expand: 'If you have any questions or require any clarification on this matter, please feel free to reach out to me at your earliest convenience.',
  },
  'thank you for your time': {
    formal: 'Thank you for your kind consideration and prompt attention to this matter.',
    creative: 'Huge thanks for taking the time to read this!',
    casual: 'Thanks for reading!',
    shorten: 'Thanks!',
    expand: 'I would like to express my sincere appreciation for your time, effort, and attention to this email.',
  },
};

const wordSynonyms: Record<string, Record<string, string>> = {
  important: {
    formal: 'critical',
    creative: 'game-changing',
    casual: 'huge',
    shorten: 'key',
    expand: 'highly significant and critical',
  },
  help: {
    formal: 'assist',
    creative: 'champion',
    casual: 'lend a hand with',
    shorten: 'aid',
    expand: 'provide valuable assistance and support',
  },
  buy: {
    formal: 'purchase',
    creative: 'snag',
    casual: 'grab',
    shorten: 'get',
    expand: 'acquire ownership of',
  },
  use: {
    formal: 'utilize',
    creative: 'harness',
    casual: 'try out',
    shorten: 'use',
    expand: 'actively implement and utilize',
  },
  quickly: {
    formal: 'promptly',
    creative: 'in a flash',
    casual: 'super fast',
    shorten: 'soon',
    expand: 'with the utmost speed and efficiency',
  },
  send: {
    formal: 'dispatch',
    creative: 'blast',
    casual: 'shoot over',
    shorten: 'send',
    expand: 'transmit and deliver',
  },
  change: {
    formal: 'modify',
    creative: 'transform',
    casual: 'tweak',
    shorten: 'edit',
    expand: 'make necessary adjustments and modifications',
  },
  great: {
    formal: 'excellent',
    creative: 'mind-blowing',
    casual: 'awesome',
    shorten: 'good',
    expand: 'exceptionally outstanding and beneficial',
  },
};

function localParaphrase(text: string, tone: string): string {
  let result = text;
  const toneKey = tone.toLowerCase();

  // 1. Replace common phrases
  for (const [phrase, options] of Object.entries(commonPhrases)) {
    const replacement = options[toneKey];
    if (replacement) {
      // Case-insensitive replacement
      const regex = new RegExp(phrase, 'gi');
      result = result.replace(regex, replacement);
    }
  }

  // 2. Replace individual words
  for (const [word, options] of Object.entries(wordSynonyms)) {
    const replacement = options[toneKey];
    if (replacement) {
      // Match word boundaries to prevent partial matching (like "helper" -> "assister")
      const regex = new RegExp(`\\b${word}\\b`, 'gi');
      result = result.replace(regex, (match) => {
        if (!match || !replacement) return match || '';
        const firstChar = match.charAt(0);
        const isCapitalized = firstChar === firstChar.toUpperCase();
        return isCapitalized
          ? replacement.charAt(0).toUpperCase() + replacement.slice(1)
          : replacement;
      });
    }
  }

  // 3. Stylistic fallback adjustments if no matching phrases
  if (result === text) {
    if (toneKey === 'formal') {
      result = `Dear Recipient,\n\n${text}\n\nSincerely,\nThe Team`;
    } else if (toneKey === 'creative') {
      result = `✨ Hey there! ✨\n\n${text}\n\nCheers! 🚀`;
    } else if (toneKey === 'casual') {
      result = `Hi!\n\n${text}\n\nBest,\nTeam`;
    }
  }

  return result;
}

export class AiService {
  public static async paraphrase({ text, tone }: ParaphraseOptions): Promise<string> {
    const geminiKey = env.GEMINI_API_KEY;
    const openAiKey = env.OPENAI_API_KEY;

    const systemPrompt = `You are a writing assistant similar to QuillBot. Paraphrase the following text in a "${tone}" tone. Make it sound natural, flow well, and maintain the original intent. Respond ONLY with the paraphrased text. Do not include any intro, outro, or quotes. Keep placeholders like {{name}} or {{email}} intact.`;

    // Try Gemini first if key exists
    if (geminiKey) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      text: `${systemPrompt}\n\nText to paraphrase:\n${text}`,
                    },
                  ],
                },
              ],
            }),
          }
        );

        if (response.ok) {
          const data = (await response.json()) as any;
          const rewritten = data.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rewritten) {
            return rewritten.trim();
          }
        }
      } catch (err) {
        console.error('Gemini API call failed, falling back:', err);
      }
    }

    // Try OpenAI next if key exists
    if (openAiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: text },
            ],
            temperature: 0.7,
          }),
        });

        if (response.ok) {
          const data = (await response.json()) as any;
          const rewritten = data.choices?.[0]?.message?.content;
          if (rewritten) {
            return rewritten.trim();
          }
        }
      } catch (err) {
        console.error('OpenAI API call failed, falling back:', err);
      }
    }

    // Default: local synonym engine
    return localParaphrase(text, tone);
  }
}
