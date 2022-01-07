import dotenv from 'dotenv'
import Joi from 'joi';


const applicationConfigSchema: Joi.ObjectSchema = Joi.object({
    NODE_API_URL: Joi.string().uri().required(),
    PRIVATE_KEY: Joi.string().required(),

    // TODO: Collapse carbon tokens into a comma-separated list
    BCT_ADDRESS: Joi.string().required(),
    MCO2_ADDRESS: Joi.string().required(),

    // Pair we are going to arbitrage
    KLIMA_ADDRESS: Joi.string().required(),
    USDC_ADDRESS: Joi.string().required(),
});

export class ConfigService {
    private config;

    constructor() {
      this.config = this.validateConfig(dotenv.config().parsed);
    }
  
    get(key: string): string {
      return process.env[key] || this.config[key];
    }
  
    private validateConfig(parsedConfig: any): any {
      const { error, value: validatedEnvConfig } = applicationConfigSchema.validate(parsedConfig);
      if (error) {
        throw Error(`Failed to validate config: ${error.message}`);
      }
      return validatedEnvConfig;
    }
  }
  