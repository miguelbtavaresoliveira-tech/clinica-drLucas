CREATE SCHEMA "identidade";
--> statement-breakpoint
CREATE TABLE "identidade"."auditoria_de_acesso" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ocorrido_em" timestamp with time zone NOT NULL,
	"tipo" text NOT NULL,
	"usuario_id" uuid,
	"dispositivo_id" uuid,
	"origem" text NOT NULL,
	"ip" "inet",
	"detalhe" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hash_anterior" text,
	"hash" text NOT NULL,
	"assinatura" text,
	"id_origem" uuid NOT NULL,
	CONSTRAINT "auditoria_de_acesso_id_origem_unique" UNIQUE("id_origem"),
	CONSTRAINT "auditoria_de_acesso_origem_valida" CHECK ("identidade"."auditoria_de_acesso"."origem" in ('servidor', 'app'))
);
--> statement-breakpoint
CREATE TABLE "identidade"."codigos_de_recuperacao" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"hash" text NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identidade"."desafios_de_login" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identidade"."dispositivos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"apelido" text NOT NULL,
	"plataforma" text NOT NULL,
	"registrado_em" timestamp with time zone NOT NULL,
	"ultimo_checkin" timestamp with time zone NOT NULL,
	"biometria_habilitada" boolean DEFAULT false NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"revogado_em" timestamp with time zone,
	"motivo_revogacao" text,
	"chave_publica_auditoria" text NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "dispositivos_plataforma_valida" CHECK ("identidade"."dispositivos"."plataforma" in ('macos', 'windows')),
	CONSTRAINT "dispositivos_situacao_valida" CHECK ("identidade"."dispositivos"."situacao" in ('ativo', 'revogado'))
);
--> statement-breakpoint
CREATE TABLE "identidade"."sessoes_de_login" (
	"id" uuid PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"dispositivo_id" uuid NOT NULL,
	"refresh_atual_hash" text NOT NULL,
	"refresh_anterior_hash" text,
	"criada_em" timestamp with time zone NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"situacao" text DEFAULT 'ativa' NOT NULL,
	"revogada_em" timestamp with time zone,
	"motivo_revogacao" text,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "sessoes_de_login_situacao_valida" CHECK ("identidade"."sessoes_de_login"."situacao" in ('ativa', 'revogada'))
);
--> statement-breakpoint
CREATE TABLE "identidade"."tokens_de_redefinicao" (
	"hash" text PRIMARY KEY NOT NULL,
	"usuario_id" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "identidade"."usuarios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"situacao" text DEFAULT 'ativo' NOT NULL,
	"papeis" text[] NOT NULL,
	"hash_de_senha" text NOT NULL,
	"senha_alterada_em" timestamp with time zone NOT NULL,
	"mfa_segredo_cifrado" "bytea",
	"mfa_segredo_pendente_cifrado" "bytea",
	"mfa_confirmado_em" timestamp with time zone,
	"mfa_ultimo_passo" bigint,
	"tentativas_falhas" integer DEFAULT 0 NOT NULL,
	"bloqueado_ate" timestamp with time zone,
	"criado_em" timestamp with time zone NOT NULL,
	"versao" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "usuarios_email_unique" UNIQUE("email"),
	CONSTRAINT "usuarios_situacao_valida" CHECK ("identidade"."usuarios"."situacao" in ('ativo', 'desativado'))
);
--> statement-breakpoint
ALTER TABLE "identidade"."codigos_de_recuperacao" ADD CONSTRAINT "codigos_de_recuperacao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidade"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidade"."desafios_de_login" ADD CONSTRAINT "desafios_de_login_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidade"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidade"."dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidade"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidade"."sessoes_de_login" ADD CONSTRAINT "sessoes_de_login_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidade"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidade"."sessoes_de_login" ADD CONSTRAINT "sessoes_de_login_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "identidade"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identidade"."tokens_de_redefinicao" ADD CONSTRAINT "tokens_de_redefinicao_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "identidade"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_de_acesso_dispositivo_idx" ON "identidade"."auditoria_de_acesso" USING btree ("dispositivo_id","id");--> statement-breakpoint
CREATE INDEX "codigos_de_recuperacao_usuario_idx" ON "identidade"."codigos_de_recuperacao" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "dispositivos_usuario_idx" ON "identidade"."dispositivos" USING btree ("usuario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uma_sessao_ativa_por_dispositivo" ON "identidade"."sessoes_de_login" USING btree ("dispositivo_id") WHERE "identidade"."sessoes_de_login"."situacao" = 'ativa';--> statement-breakpoint
CREATE INDEX "sessoes_de_login_usuario_idx" ON "identidade"."sessoes_de_login" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_de_login_refresh_atual_idx" ON "identidade"."sessoes_de_login" USING btree ("refresh_atual_hash");--> statement-breakpoint
CREATE INDEX "sessoes_de_login_refresh_anterior_idx" ON "identidade"."sessoes_de_login" USING btree ("refresh_anterior_hash");--> statement-breakpoint
CREATE INDEX "tokens_de_redefinicao_usuario_idx" ON "identidade"."tokens_de_redefinicao" USING btree ("usuario_id");