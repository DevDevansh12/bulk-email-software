import type { Request, Response } from 'express';
import { validateParaphrase } from './ai.validation.js';
import { AiService } from './ai.service.js';

export class AiController {
  paraphrase = async (req: Request, res: Response): Promise<void> => {
    // Validate payload
    const { text, tone } = validateParaphrase({
      text: req.body['text'],
      tone: req.body['tone'],
    });

    // Call service to paraphrase
    const paraphrasedText = await AiService.paraphrase({ text, tone });

    res.status(200).json({
      success: true,
      data: {
        paraphrasedText,
      },
    });
  };
}
