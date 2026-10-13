import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IdentidadeEAcessoModule } from './identidade-e-acesso/identidade-e-acesso.module.js';

@Module({
  imports: [IdentidadeEAcessoModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
