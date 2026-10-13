<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login & Autenticação Clínica - EVO Fisioterapia</title>
  <!-- Google Fonts & Tailwind CSS CDN -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <!-- Phosphor Icons -->
  <script src="https://unpkg.com/@phosphor-icons/web@2.1.1"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"Plus Jakarta Sans"', 'sans-serif'],
            mono: ['"JetBrains Mono"', 'monospace'],
          },
          colors: {
            brand: {
              50: '#eff9fa',
              100: '#d7f0f2',
              200: '#b4e2e6',
              500: '#14b8a6',
              600: '#0d9488',
              700: '#0f4c5c',
              800: '#0c3b48',
              900: '#082832',
              950: '#04171d',
            },
            surface: {
              DEFAULT: '#f8f9ff',
              dim: '#cbdbf5',
              low: '#eff4ff',
              card: '#ffffff'
            }
          }
        }
      }
    }
  </script>
  <style>
    body {
      font-family: 'Plus Jakarta Sans', sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .mesh-gradient {
      background: radial-gradient(circle at 15% 20%, rgba(20, 184, 166, 0.22) 0%, transparent 45%),
                  radial-gradient(circle at 85% 80%, rgba(15, 76, 92, 0.45) 0%, transparent 50%),
                  radial-gradient(circle at 50% 50%, rgba(12, 59, 72, 0.8) 0%, #04171d 100%);
    }
    .custom-scrollbar::-webkit-scrollbar {
      width: 5px;
    }
    .custom-scrollbar::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 4px;
    }
  </style>
</head>
<body class="bg-[#f0f4f8] text-slate-800 min-h-screen flex flex-col justify-between selection:bg-teal-500 selection:text-white">

  <!-- Sub-header bar com indicador de ambiente e status rápido -->
  <header class="bg-white/80 backdrop-blur-md border-b border-slate-200/80 px-6 py-2.5 flex items-center justify-between text-xs z-30">
    <div class="flex items-center gap-3">
      <span class="inline-flex items-center gap-1.5 font-semibold text-slate-700">
        <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
        Servidor Clínico Seguro (São Paulo - SP)
      </span>
      <span class="text-slate-300">|</span>
      <span class="text-slate-500 hidden sm:inline">Transição Ativa: Clínica Integrada & Visitas Domiciliares</span>
    </div>
    <div class="flex items-center gap-4">
      <span class="inline-flex items-center gap-1 text-slate-500">
        <i class="ph-bold ph-shield-check text-emerald-600 text-sm"></i>
        SSL 256-bit • HIPAA/LGPD Compliant
      </span>
      <span class="text-slate-300 hidden md:inline">|</span>
      <span class="font-mono text-slate-400 font-medium hidden md:inline">v2.4 Pro Clinic</span>
    </div>
  </header>

  <!-- Container Principal do Split Screen -->
  <main class="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-10">
    <div class="w-full max-w-6xl bg-white rounded-3xl shadow-2xl shadow-slate-900/10 border border-slate-200/90 overflow-hidden flex flex-col lg:flex-row min-h-[680px]">
      
      <!-- ============================================================ -->
      <!-- LADO ESQUERDO: BRANDING INSTITUCIONAL & CONFIANÇA CLÍNICA (~45%) -->
      <!-- ============================================================ -->
      <div class="lg:w-[46%] mesh-gradient relative p-8 sm:p-12 flex flex-col justify-between text-white overflow-hidden">
        <!-- Elementos de fundo geométricos sutis -->
        <div class="absolute -top-24 -left-24 w-80 h-80 rounded-full bg-teal-500/10 blur-3xl pointer-events-none"></div>
        <div class="absolute -bottom-24 -right-24 w-80 h-80 rounded-full bg-sky-500/10 blur-3xl pointer-events-none"></div>

        <!-- Marca e Identidade Topo -->
        <div class="relative z-10 space-y-6">
          <div class="inline-flex items-center gap-3 bg-white/10 backdrop-blur-md border border-white/15 px-4 py-2 rounded-2xl shadow-sm">
            <div class="w-9 h-9 rounded-xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <i class="ph-bold ph-activity text-xl"></i>
            </div>
            <div>
              <div class="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                EVO FISIOTERAPIA
                <span class="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-teal-500/30 text-teal-200 border border-teal-400/30">Clinical SaaS</span>
              </div>
              <div class="text-[11px] font-medium text-slate-300 tracking-wide">DR. LUCAS DAMASCENO • CREFITO 248.910-F</div>
            </div>
          </div>

          <div class="pt-4 space-y-3">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-400/25 text-emerald-300 text-xs font-semibold">
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              Acesso Exclusivo & Operacional
            </div>
            <h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight text-white">
              Gestão clínica inteligente para o tratamento da dor crônica e coluna.
            </h1>
            <p class="text-sm text-slate-300 leading-relaxed max-w-md">
              Ambiente unificado para prontuário eletrônico SOAP, mapa de dor, sincronização com WhatsApp, laudos funcionais e planejamento da nova clínica.
            </p>
          </div>
        </div>

        <!-- Card Flutuante de Perfil & Dados Clínicos em Tempo Real -->
        <div class="relative z-10 my-8 space-y-4">
          <div class="bg-white/10 backdrop-blur-xl border border-white/15 rounded-2xl p-4 sm:p-5 shadow-lg">
            <div class="flex items-center justify-between pb-3 border-b border-white/10 text-xs text-slate-300 font-medium">
              <span class="flex items-center gap-1.5 text-teal-300">
                <i class="ph-bold ph-calendar-check text-sm"></i>
                Status Operacional de Hoje
              </span>
              <span class="text-slate-300 font-mono">Quarta-feira, 24 Out</span>
            </div>
            
            <div class="grid grid-cols-3 gap-3 pt-3 text-center">
              <div class="bg-white/5 rounded-xl p-2.5 border border-white/5">
                <div class="text-lg font-bold text-white">6</div>
                <div class="text-[11px] text-slate-300 leading-tight">Pacientes Hoje</div>
              </div>
              <div class="bg-white/5 rounded-xl p-2.5 border border-white/5">
                <div class="text-lg font-bold text-teal-300">100%</div>
                <div class="text-[11px] text-slate-300 leading-tight">WhatsApp Sync</div>
              </div>
              <div class="bg-white/5 rounded-xl p-2.5 border border-white/5">
                <div class="text-lg font-bold text-emerald-400">Ativo</div>
                <div class="text-[11px] text-slate-300 leading-tight">Modo Híbrido</div>
              </div>
            </div>

            <!-- Mini pill do Profissional Responsável -->
            <div class="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <img src="https://lh3.googleusercontent.com/aida/AEtjO1XDDoMEaqMxOYkMyAdb2VeI6cqiubvLOqRjUE9PZXPrkLbWNxHIXmDFW-47gprov4wUBAjNRV2o0QWN7C0LqnhZT7I-29LZl_5TiavxwYWSfewy6b156RLj5PmihDWFqGLIpImmVxNBtKh1A2stIKUl-NplVbZPWQySpkyYmIBwic6DBsfqZVhkLAXs9xfroTvR09K6qnFn8kqdHVMsPoXfE1KYynuVhO2NwzvALDdpL9M_WaUFn0-urAnp" alt="Dr. Lucas Damasceno" class="w-8 h-8 rounded-full object-cover border border-teal-400/50 shadow-sm">
                <div>
                  <div class="text-xs font-semibold text-white">Dr. Lucas Damasceno</div>
                  <div class="text-[10px] text-slate-300">Especialista Coluna & Reabilitação</div>
                </div>
              </div>
              <div class="text-[11px] text-teal-200 bg-teal-500/20 px-2 py-0.5 rounded-md border border-teal-400/20 font-medium">
                Sessão Segura
              </div>
            </div>
          </div>
        </div>

        <!-- Rodapé do Lado Esquerdo -->
        <div class="relative z-10 pt-2 flex items-center justify-between text-xs text-slate-400 border-t border-white/10">
          <div class="flex items-center gap-1.5">
            <i class="ph-bold ph-lock-key text-teal-400"></i>
            <span>Criptografia ponta a ponta</span>
          </div>
          <span class="text-[11px] text-slate-400">fisioterapiaevo.com.br</span>
        </div>
      </div>


      <!-- ============================================================ -->
      <!-- LADO DIREITO: FORMULÁRIO DE LOGIN & INTERATIVIDADE (~55%) -->
      <!-- ============================================================ -->
      <div class="lg:w-[54%] p-8 sm:p-12 lg:p-14 flex flex-col justify-between bg-white relative">
        
        <!-- Top bar com seletor interativo de estados do formulário -->
        <div class="flex flex-wrap items-center justify-between gap-3 pb-6 border-b border-slate-100">
          <div class="flex items-center gap-2">
            <span class="text-xs font-semibold text-slate-500 uppercase tracking-wider">Visualizar Estado:</span>
            <div class="inline-flex p-1 bg-slate-100 rounded-xl text-xs font-medium">
              <button id="tab-default" onclick="switchState('default')" class="px-3 py-1 rounded-lg bg-white text-slate-800 shadow-sm transition-all font-semibold">
                Padrão (Default)
              </button>
              <button id="tab-error" onclick="switchState('error')" class="px-3 py-1 rounded-lg text-slate-500 hover:text-slate-800 transition-all">
                Erro de Validação
              </button>
              <button id="tab-recovery" onclick="openRecoveryModal()" class="px-3 py-1 rounded-lg text-teal-700 hover:text-teal-900 transition-all flex items-center gap-1">
                <i class="ph-bold ph-key text-xs"></i>
                Esqueci Senha
              </button>
            </div>
          </div>

          <div class="hidden sm:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200/60 px-2.5 py-1 rounded-lg">
            <i class="ph-fill ph-device-tablet text-teal-700"></i>
            <span>Otimizado para Consultório & Tablet</span>
          </div>
        </div>

        <!-- Conteúdo Central do Formulário -->
        <div class="my-auto py-6 max-w-md w-full mx-auto">
          
          <!-- Cabeçalho de Boas-vindas -->
          <div class="space-y-2 mb-8">
            <div class="inline-flex items-center gap-2 text-xs font-semibold text-teal-800 bg-teal-50 px-3 py-1 rounded-full border border-teal-100">
              <i class="ph-bold ph-shield-check"></i>
              Portal de Acesso Restrito
            </div>
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Acesse sua conta
            </h2>
            <p class="text-sm text-slate-500">
              Digite suas credenciais clínicas para gerenciar pacientes, agenda e finanças.
            </p>
          </div>

          <!-- BANNER DE ERRO DINÂMICO (Ativado no estado de erro) -->
          <div id="error-banner" class="hidden mb-6 p-4 rounded-2xl bg-rose-50 border border-rose-200 flex items-start gap-3 transition-all duration-200">
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
              <i class="ph-bold ph-warning-circle text-lg"></i>
            </div>
            <div class="flex-1">
              <h4 class="text-xs font-bold text-rose-900">Credenciais não encontradas</h4>
              <p class="text-xs text-rose-700 mt-0.5">E-mail ou senha incorretos. Verifique os dados ou utilize o acesso rápido via WhatsApp.</p>
            </div>
          </div>

          <!-- Formulário -->
          <form onsubmit="handleLoginSubmit(event)" class="space-y-5">
            
            <!-- Campo: E-mail / Usuário -->
            <div class="space-y-1.5">
              <label for="input-email" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                E-mail ou Usuário Profissional <span class="text-rose-500">*</span>
              </label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <i class="ph-bold ph-envelope-simple text-lg"></i>
                </div>
                <input 
                  type="email" 
                  id="input-email" 
                  name="email"
                  value="lucas@fisioterapiaevo.com.br"
                  required
                  placeholder="lucas@fisioterapiaevo.com.br"
                  class="w-full pl-11 pr-4 py-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 focus:bg-white transition-all shadow-sm"
                >
              </div>
            </div>

            <!-- Campo: Senha com Toggle e Estado de Erro -->
            <div class="space-y-1.5">
              <div class="flex items-center justify-between">
                <label for="input-password" class="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Senha de Acesso <span class="text-rose-500">*</span>
                </label>
                <button 
                  type="button" 
                  onclick="openRecoveryModal()" 
                  class="text-xs font-semibold text-teal-800 hover:text-teal-900 hover:underline transition-all"
                >
                  Esqueceu a senha?
                </button>
              </div>
              
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400" id="password-icon">
                  <i class="ph-bold ph-lock-key text-lg"></i>
                </div>
                <input 
                  type="password" 
                  id="input-password" 
                  name="password"
                  value="ClinicaEvo2024!"
                  required
                  placeholder="••••••••••••"
                  class="w-full pl-11 pr-11 py-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 focus:bg-white transition-all shadow-sm font-mono"
                >
                <button 
                  type="button" 
                  onclick="togglePasswordVisibility()" 
                  class="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                  title="Mostrar/Ocultar Senha"
                >
                  <i id="password-toggle-icon" class="ph-bold ph-eye text-lg"></i>
                </button>
              </div>
              <p id="password-error-hint" class="hidden text-xs text-rose-600 font-medium flex items-center gap-1 mt-1">
                <i class="ph-bold ph-x-circle"></i>
                A senha digitada está incorreta para este usuário.
              </p>
            </div>

            <!-- Opções: Lembrar neste dispositivo -->
            <div class="flex items-center justify-between pt-1">
              <label class="flex items-center gap-2.5 cursor-pointer select-none group">
                <input 
                  type="checkbox" 
                  id="remember-device" 
                  checked 
                  class="w-4 h-4 rounded border-slate-300 text-teal-700 focus:ring-teal-700/30 transition-all rounded-md cursor-pointer"
                >
                <span class="text-xs font-medium text-slate-600 group-hover:text-slate-900 transition-colors">
                  Manter conectado neste dispositivo (Tablet / Consultório)
                </span>
              </label>
            </div>

            <!-- Botão Principal de Login (CTA) -->
            <div class="pt-2">
              <button 
                type="submit" 
                id="btn-submit"
                class="w-full py-3.5 px-6 rounded-xl bg-[#0f4c5c] hover:bg-[#0c3b48] active:bg-[#082832] text-white font-bold text-sm shadow-lg shadow-[#0f4c5c]/25 hover:shadow-[#0f4c5c]/35 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99]"
              >
                <span>Entrar no Sistema</span>
                <i class="ph-bold ph-arrow-right text-base transition-transform group-hover:translate-x-1"></i>
              </button>
            </div>

            <!-- Separador "OU" -->
            <div class="relative py-2 flex items-center">
              <div class="flex-grow border-t border-slate-200"></div>
              <span class="flex-shrink mx-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Ou acesse com</span>
              <div class="flex-grow border-t border-slate-200"></div>
            </div>

            <!-- Botão Secundário: Acesso Rápido WhatsApp Clínico -->
            <div>
              <button 
                type="button" 
                onclick="sendWhatsAppAccessCode()"
                class="w-full py-3 px-4 rounded-xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-200/90 text-emerald-900 font-semibold text-xs flex items-center justify-center gap-2.5 transition-all shadow-sm"
              >
                <div class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shadow-xs">
                  <i class="ph-bold ph-whatsapp-logo text-sm"></i>
                </div>
                <span>Entrar via Código Rápido no WhatsApp do Dr. Lucas</span>
              </button>
              <div class="text-[11px] text-center text-slate-400 mt-1.5">
                Envia token descartável de 6 dígitos para o número cadastrado final <strong class="text-slate-600">••••-1109</strong>
              </div>
            </div>

          </form>

        </div>

        <!-- Rodapé do Formulário / Segurança -->
        <div class="pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>Acesso restrito a usuários autorizados • Criptografia TLS 1.3</span>
          </div>
          <div class="flex items-center gap-3">
            <a href="#" class="hover:text-slate-600 hover:underline">Política de Privacidade</a>
            <span>•</span>
            <span class="font-mono text-slate-500 font-semibold">EVO v2.4.0</span>
          </div>
        </div>

      </div>

    </div>
  </main>

  <!-- ============================================================ -->
  <!-- MODAL DE RECUPERAÇÃO DE SENHA (ESQUECI MINHA SENHA) -->
  <!-- ============================================================ -->
  <div id="recovery-modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm hidden items-center justify-center p-4 transition-all">
    <div class="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 relative animate-in fade-in zoom-in-95 duration-200">
      
      <!-- Botão Fechar Modal -->
      <button 
        type="button" 
        onclick="closeRecoveryModal()" 
        class="absolute top-5 right-5 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors"
      >
        <i class="ph-bold ph-x text-base"></i>
      </button>

      <!-- Cabeçalho Modal -->
      <div class="flex items-center gap-3.5 mb-6">
        <div class="w-12 h-12 rounded-2xl bg-teal-50 border border-teal-100 text-teal-800 flex items-center justify-center shrink-0">
          <i class="ph-bold ph-key-return text-2xl"></i>
        </div>
        <div>
          <h3 class="text-xl font-extrabold text-slate-900">Recuperação de Acesso</h3>
          <p class="text-xs text-slate-500">Selecione onde deseja receber o link ou código de redefinição</p>
        </div>
      </div>

      <!-- Métodos de Recuperação -->
      <div class="space-y-3 mb-6">
        
        <!-- Opção 1: WhatsApp Clínico (Recomendada) -->
        <label class="block p-4 rounded-2xl border-2 border-teal-700 bg-teal-50/40 cursor-pointer relative transition-all">
          <input type="radio" name="recovery_method" value="whatsapp" checked class="sr-only">
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-sm">
                <i class="ph-bold ph-whatsapp-logo text-xl"></i>
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-sm font-bold text-slate-900">WhatsApp Profissional</span>
                  <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">Mais Rápido</span>
                </div>
                <p class="text-xs text-slate-600 mt-0.5">Envia código token instantâneo para <strong>(11) 98452-1109</strong></p>
              </div>
            </div>
            <div class="w-5 h-5 rounded-full border-2 border-teal-700 bg-teal-700 flex items-center justify-center text-white text-xs">
              <i class="ph-bold ph-check"></i>
            </div>
          </div>
        </label>

        <!-- Opção 2: E-mail Principal -->
        <label class="block p-4 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/50 cursor-pointer relative transition-all">
          <input type="radio" name="recovery_method" value="email" class="sr-only">
          <div class="flex items-start justify-between">
            <div class="flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center shrink-0">
                <i class="ph-bold ph-envelope-simple text-xl"></i>
              </div>
              <div>
                <div class="text-sm font-bold text-slate-900">E-mail Cadastrado</div>
                <p class="text-xs text-slate-600 mt-0.5">Envia link seguro para <strong>lucas@fisioterapiaevo.com.br</strong></p>
              </div>
            </div>
            <div class="w-5 h-5 rounded-full border border-slate-300 bg-white"></div>
          </div>
        </label>

      </div>

      <!-- Feedback de envio (simulado) -->
      <div id="recovery-feedback" class="hidden mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center gap-2">
        <i class="ph-bold ph-check-circle text-base text-emerald-600"></i>
        <span>Código enviado com sucesso! Verifique seu WhatsApp em instantes.</span>
      </div>

      <!-- Ações do Modal -->
      <div class="flex items-center justify-end gap-3 pt-2">
        <button 
          type="button" 
          onclick="closeRecoveryModal()" 
          class="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
        >
          Cancelar
        </button>
        <button 
          type="button" 
          id="btn-send-recovery"
          onclick="triggerSendRecovery()"
          class="px-5 py-2.5 rounded-xl bg-[#0f4c5c] hover:bg-[#0c3b48] text-white text-xs font-bold flex items-center gap-2 shadow-md shadow-[#0f4c5c]/20 transition-all"
        >
          <i class="ph-bold ph-paper-plane-tilt"></i>
          <span>Enviar Código de Redefinição</span>
        </button>
      </div>

    </div>
  </div>

  <!-- Toast Notification Simulado para Ações -->
  <div id="toast-notification" class="fixed bottom-6 right-6 z-50 transform translate-y-24 opacity-0 transition-all duration-300 pointer-events-none">
    <div class="bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 border border-slate-700 text-xs">
      <div class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
        <i class="ph-bold ph-check"></i>
      </div>
      <span id="toast-message">Código de login enviado para o WhatsApp!</span>
    </div>
  </div>

  <!-- Script de Interatividade & Estados -->
  <script>
    // Alternar visibilidade da senha
    function togglePasswordVisibility() {
      const passwordInput = document.getElementById('input-password');
      const toggleIcon = document.getElementById('password-toggle-icon');
      
      if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.className = 'ph-bold ph-eye-slash text-lg';
      } else {
        passwordInput.type = 'password';
        toggleIcon.className = 'ph-bold ph-eye text-lg';
      }
    }

    // Alternar estados visuais (Padrão vs Erro)
    function switchState(state) {
      const tabDefault = document.getElementById('tab-default');
      const tabError = document.getElementById('tab-error');
      const errorBanner = document.getElementById('error-banner');
      const passwordInput = document.getElementById('input-password');
      const passwordErrorHint = document.getElementById('password-error-hint');
      const passwordIcon = document.getElementById('password-icon');

      if (state === 'error') {
        tabDefault.className = 'px-3 py-1 rounded-lg text-slate-500 hover:text-slate-800 transition-all';
        tabError.className = 'px-3 py-1 rounded-lg bg-rose-600 text-white shadow-sm transition-all font-semibold';
        
        errorBanner.classList.remove('hidden');
        passwordErrorHint.classList.remove('hidden');
        passwordInput.className = 'w-full pl-11 pr-11 py-3 bg-rose-50/40 hover:bg-rose-50 border-2 border-rose-500 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-600 transition-all shadow-sm font-mono';
        passwordIcon.className = 'absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-rose-500';
      } else {
        tabDefault.className = 'px-3 py-1 rounded-lg bg-white text-slate-800 shadow-sm transition-all font-semibold';
        tabError.className = 'px-3 py-1 rounded-lg text-slate-500 hover:text-slate-800 transition-all';
        
        errorBanner.classList.add('hidden');
        passwordErrorHint.classList.add('hidden');
        passwordInput.className = 'w-full pl-11 pr-11 py-3 bg-slate-50/70 hover:bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-700/20 focus:border-teal-700 focus:bg-white transition-all shadow-sm font-mono';
        passwordIcon.className = 'absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400';
      }
    }

    // Modal de Recuperação de Senha
    function openRecoveryModal() {
      const modal = document.getElementById('recovery-modal');
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }

    function closeRecoveryModal() {
      const modal = document.getElementById('recovery-modal');
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      document.getElementById('recovery-feedback').classList.add('hidden');
    }

    function triggerSendRecovery() {
      const feedback = document.getElementById('recovery-feedback');
      const btn = document.getElementById('btn-send-recovery');
      btn.innerHTML = `<i class="ph-bold ph-circle-notch animate-spin"></i><span>Enviando...</span>`;
      
      setTimeout(() => {
        feedback.classList.remove('hidden');
        btn.innerHTML = `<i class="ph-bold ph-check"></i><span>Código Enviado</span>`;
        showToast("Link de recuperação enviado com sucesso!");
        setTimeout(() => {
          closeRecoveryModal();
          btn.innerHTML = `<i class="ph-bold ph-paper-plane-tilt"></i><span>Enviar Código de Redefinição</span>`;
        }, 1800);
      }, 700);
    }

    // Toast de notificação
    function showToast(msg) {
      const toast = document.getElementById('toast-notification');
      document.getElementById('toast-message').textContent = msg;
      toast.classList.remove('translate-y-24', 'opacity-0');
      toast.classList.add('translate-y-0', 'opacity-100');
      
      setTimeout(() => {
        toast.classList.remove('translate-y-0', 'opacity-100');
        toast.classList.add('translate-y-24', 'opacity-0');
      }, 3500);
    }

    function sendWhatsAppAccessCode() {
      showToast("Token de 6 dígitos enviado para o WhatsApp do Dr. Lucas!");
    }

    function handleLoginSubmit(e) {
      e.preventDefault();
      const btn = document.getElementById('btn-submit');
      btn.innerHTML = `<i class="ph-bold ph-circle-notch animate-spin text-base"></i><span>Autenticando sessão clínica...</span>`;
      
      setTimeout(() => {
        btn.innerHTML = `<i class="ph-bold ph-check text-base"></i><span>Acesso Autorizado! Redirecionando...</span>`;
        btn.className = 'w-full py-3.5 px-6 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2 transition-all';
        showToast("Bem-vindo de volta, Dr. Lucas Damasceno!");
      }, 1000);
    }
  </script>
</body>
</html>
