CREATE OR REPLACE FUNCTION identidade.impedir_alteracao_de_auditoria() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'auditoria_de_acesso é append-only';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER auditoria_append_only BEFORE UPDATE OR DELETE ON identidade.auditoria_de_acesso
  FOR EACH ROW EXECUTE FUNCTION identidade.impedir_alteracao_de_auditoria();
--> statement-breakpoint
CREATE TRIGGER auditoria_sem_truncate BEFORE TRUNCATE ON identidade.auditoria_de_acesso
  FOR EACH STATEMENT EXECUTE FUNCTION identidade.impedir_alteracao_de_auditoria();
