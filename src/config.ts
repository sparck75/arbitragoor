import dotenv from 'dotenv'
import Joi from 'joi'


const applicationConfigSchema: Joi.ObjectSchema = Joi.object({
    NODE_API_URL: Joi.string().uri().required(),
    PRIVATE_KEY: Joi.string().required(),
    FLASHLOAN_ADDRESS: Joi.string().required(),
    BORROWED_AMOUNT: Joi.number().required(),
    KLIMA_ADDRESS: Joi.string().required(),
    USDC_ADDRESS: Joi.string().required(),
    BCT_ADDRESS: Joi.string().required(),
    MCO2_ADDRESS: Joi.string().required(),
})

export class ConfigService {
    private config

    constructor() {
      this.config = this.validateConfig(dotenv.config().parsed)
    }
  
    get(key: string): string {
      return process.env[key] || this.config[key]
    }
  
    private validateConfig(parsedConfig: any): any {
      const { error, value: validatedEnvConfig } = applicationConfigSchema.validate(parsedConfig)
      if (error) {
        throw Error(`Failed to validate config: ${error.message}`)
      }
      return validatedEnvConfig
    }
  }
  