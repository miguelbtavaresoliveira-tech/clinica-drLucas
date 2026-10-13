import { SetMetadata } from '@nestjs/common';
import type { Permissao } from '../../../domain/index.js';

export const CHAVE_PERMISSAO = 'identidade:permissao';

export const RequerPermissao = (permissao: Permissao) => SetMetadata(CHAVE_PERMISSAO, permissao);
