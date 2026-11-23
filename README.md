# App Exemplo Seeflex

Projeto base para empresas que usam o Seeflex publicarem o próprio aplicativo na Play Store e na App Store.

O app abre o sistema web do Seeflex dentro de uma WebView e acrescenta:

- login nativo por usuário e senha, QR Code ou token, com links para "Esqueci minha senha" e "Entrar como Administrador";
- biometria (Face ID / digital) para manter o usuário conectado sem digitar a senha de novo;
- notificações push via Firebase Cloud Messaging;
- abertura de rotas do Google Maps, Waze e Telegram nos apps nativos;
- recarga automática do mapa quando o app fica mais de 60 segundos em segundo plano.

Feito em React Native 0.81, com a nova arquitetura ativa. Esta é a versão atual e recomendada para publicação.

---

## Antes de começar: o que é este app

O app é um **navegador com a marca da sua empresa**. Depois do login, tudo o que aparece (mapa, veículos, histórico,
alertas, relatórios, cadastros) é o próprio sistema web Seeflex, carregado dentro da WebView. É o mesmo que abrir o
endereço do sistema no Chrome ou no Safari do celular.

Por isso:

- **Não existe backend, banco de dados ou API do app.** Não há nada para hospedar nem configurar no servidor.
- **O app não armazena dados.** Usuários, veículos e todo o resto ficam no sistema web.
- **Se uma função funciona no navegador, funciona no app.** Mudanças no sistema aparecem no app sem precisar publicar
  nova versão.
- **Não existe ambiente de testes separado.** Os testes e a revisão das lojas usam o próprio sistema da empresa, com um
  usuário fornecido por ela.

### Quem cuida do quê

| Item | Responsável |
| --- | --- |
| Sistema web: servidor, login, mapa, rastreamento, dados dos usuários | Seeflex |
| Personalização do app (nome, ícone, identificadores, textos) | Você |
| Projeto Firebase do app e chave APNs do iOS (seção 5) | Você / empresa dona do app |
| Contas de desenvolvedor na Google Play e na App Store, publicação e atualizações | Você / empresa dona do app |
| Usuário de teste para a revisão das lojas | Empresa dona do app |
| Declarações de privacidade nas lojas | Você (a seção 9 traz as informações) |

A Seeflex **não publica apps de terceiros** nas próprias contas de loja. Nenhum elemento da marca Seeflex precisa
permanecer no app.

---

## 1. Preparar o ambiente

| Ferramenta | Versão |
| --- | --- |
| Node | 20 ou superior |
| Android Studio | com JDK 17 e SDK 36 |
| Xcode | versão atual, só no macOS |
| CocoaPods | via `bundle install` (Gemfile do projeto) |

```sh
npm install
cd ios && bundle install && bundle exec pod install && cd ..
```

Rodar em modo de desenvolvimento:

```sh
npx react-native run-android
npx react-native run-ios
```

> No iOS, abra sempre o `ios/app_seeflex_exemplo.xcworkspace`, nunca o `.xcodeproj`.

---

## 2. Arquivos do projeto que você vai editar

| O que | Onde |
| --- | --- |
| Servidor(es) do app | `App.js` (`urlsDisponiveis`) |
| Nome exibido no Android | `android/app/src/main/res/values/strings.xml` (`app_name`) |
| Nome exibido no iOS | `ios/app_seeflex_exemplo/Info.plist` (`CFBundleDisplayName`) |
| Package do Android | `applicationId` em `android/app/build.gradle` |
| Bundle ID do iOS | Xcode > target > Signing & Capabilities |
| Versão no Android | `versionCode` e `versionName` em `android/app/build.gradle` |
| Versão no iOS | Xcode > target > General (Version e Build) |
| Logo das telas de login e carregamento | `src/images/icon.png` |
| Ícone do app no Android | `android/app/src/main/res/mipmap-*` |
| Ícone do app no iOS | `ios/app_seeflex_exemplo/Images.xcassets/AppIcon.appiconset` |
| Textos das permissões no iOS | `ios/app_seeflex_exemplo/Info.plist` (chaves `NS...UsageDescription`) |
| Textos das permissões no Android | `src/components/permissoes.js` |
| Configuração do Firebase no Android | `android/app/google-services.json` |
| Configuração do Firebase no iOS | `ios/app_seeflex_exemplo/GoogleService-Info.plist` |
| Chave de publicação no Android | `android/gradle.properties` (`MYAPP_UPLOAD_*`) |

---

## 3. Servidor

No `App.js`, a lista `urlsDisponiveis` define os servidores do app:

```js
const urlsDisponiveis = [
  {title: 'Nome do Servidor', url: 'https://suaempresa.seeflex.com.br'},
];
```

- **Um servidor:** o app acessa direto esse servidor.
- **Mais de um:** o usuário escolhe o servidor na tela de login.
- **Lista vazia:** o usuário digita a URL do servidor.

Pontos de atenção:

- Use sempre `https://`. O app troca `http://` por `https://` automaticamente, exceto em endereços de rede local (`192.168.`).
- Quando o usuário digita a URL, só são aceitos endereços `.seeflex.com.br` e `.goflex.net.br` (ver `src/services/urlUtils.js`).
- Se o cadastro do usuário no sistema tiver uma "URL para aplicativos" preenchida, o app passa a usar essa URL nos próximos acessos.

---

## 4. Identidade do app

### Package (Android) e Bundle ID (iOS)

São os identificadores únicos do app nas lojas, por exemplo `br.com.suaempresa.app`. **Não é possível alterá-los depois da
primeira publicação.**

- **Android:** altere só o `applicationId` em `android/app/build.gradle`. O `namespace` e a pasta
  `android/app/src/main/java/com/app_seeflex_exemplo` podem continuar como estão.
- **iOS:** altere no Xcode, em Signing & Capabilities. O Bundle ID precisa estar registrado na sua conta Apple Developer.

Os dois precisam ser **exatamente iguais** aos cadastrados no Firebase (seção 5).

### Nome, ícone e logo

- O ícone do iOS precisa de todos os tamanhos do `AppIcon.appiconset`, incluindo o de 1024x1024, sem transparência.
- No Android, o ícone adaptativo (Android 8+) usa os arquivos `mipmap-*-v26/ic_foreground.png` e a cor de fundo de
  `values/colors-icon.xml`. Os `mipmap-*/ic_launcher.png` são usados nas versões mais antigas.
- `src/images/icon.png` é a imagem exibida na tela de login e durante o carregamento.

### Versão

Cada envio para a loja precisa de um número de build maior que o anterior:

- **Android:** `versionCode` (número inteiro, sempre crescente) e `versionName` (versão exibida, ex. `1.0.1`).
- **iOS:** Build (sempre crescente) e Version (versão exibida).

---

## 5. Notificações push (Firebase)

Cada app usa o **próprio projeto Firebase**, criado na conta Google da empresa dona do app. A Seeflex não cria nem
gerencia projetos Firebase de terceiros.

> **Migração em andamento:** o sistema Seeflex está migrando o envio de push do OneSignal para o Firebase. O app já está
> pronto para o Firebase, mas o envio pelo sistema usando o Firebase de cada cliente ainda está sendo concluído. Até lá,
> o app registra o aparelho normalmente, porém as notificações enviadas pelo sistema podem não chegar. Quando a migração
> terminar, a Seeflex vai informar o que precisa ser feito para ativar o push do seu app. Por isso, já crie e configure
> o Firebase do app desde agora, seguindo os passos abaixo.

### Arquivos de exemplo

Os dois arquivos abaixo já estão no lugar certo, mas **com valores fictícios** (`xxxxx` e `00000`). Servem só para mostrar
onde cada arquivo fica e permitir compilar o projeto:

| Arquivo | Local |
| --- | --- |
| `google-services.json` | `android/app/google-services.json` |
| `GoogleService-Info.plist` | `ios/app_seeflex_exemplo/GoogleService-Info.plist` |

Com os arquivos de exemplo, o app compila e funciona normalmente, **mas não recebe push**. Para receber, os dois arquivos
precisam ser substituídos pelos reais.

### Como obter os arquivos reais

1. Crie um projeto em [console.firebase.google.com](https://console.firebase.google.com), com a conta Google da empresa
   dona do app.
2. No projeto, adicione um app **Android** com o mesmo `applicationId` e baixe o `google-services.json`.
3. Adicione um app **iOS** com o mesmo Bundle ID e baixe o `GoogleService-Info.plist`. Nos passos seguintes do assistente
   (adicionar SDK, código de inicialização), só avance: o projeto já tem tudo isso.
4. Substitua os arquivos de exemplo pelos baixados, **mantendo o mesmo nome e o mesmo local**. Cuidado ao baixar:
   às vezes o arquivo vem com `(1)` no nome ou sem a extensão.
5. **Só no iOS:** gere uma chave APNs no Apple Developer (Certificates, Identifiers & Profiles > Keys > Apple Push
   Notifications service) e cadastre no Firebase, em Configurações do projeto > Cloud Messaging > Configuração do app
   Apple, com o arquivo `.p8`, o Key ID e o Team ID. Sem essa chave, o push não chega no iPhone. A chave só pode ser
   baixada uma vez: guarde uma cópia em local seguro.

### Conferências

- O `package_name` do `google-services.json` precisa ser igual ao `applicationId`. Se for diferente, o build do Android
  falha com `No matching client found for package name`.
- O `BUNDLE_ID` do `GoogleService-Info.plist` precisa ser igual ao Bundle ID do target no Xcode.
- No Xcode, em Signing & Capabilities, a capability **Push Notifications** precisa estar ativa. O projeto já tem o arquivo
  `app_seeflex_exemplo.entitlements` configurado.
- Não adicione o pacote `firebase-ios-sdk` pelo Swift Package Manager, mesmo que o guia do console do Firebase peça. O
  Firebase já vem pelo CocoaPods, e os dois juntos dão conflito no build.
- Push não funciona no simulador do iOS. Teste em um iPhone físico.
- No Android 13 ou superior, o app pede permissão de notificação na primeira abertura. Se o usuário negar, o push não
  aparece.

### Como funciona

- Ao chegar no mapa depois do login, o app grava o token do aparelho no cadastro do usuário (`fcm_token`).
- No logout, o token é apagado e o aparelho deixa de receber push daquele usuário.
- Ao tocar na notificação, o app abre a tela enviada pelo servidor.
- Cada usuário recebe push em um aparelho: o último que fez login.

### Testar o push

1. Faça login pelo app, em um aparelho físico.
2. No sistema, abra o cadastro do usuário que fez o login.
3. Se o registro do push deu certo, aparece um **ícone de sininho**. Clique nele para o sistema enviar uma notificação de
   teste.

Se o sininho não aparecer, o app não conseguiu registrar o aparelho: confira os itens de "Conferências" acima.

Enquanto a migração do push não estiver concluída (veja o início desta seção), o sininho já confirma que o registro do
aparelho funcionou, mas a notificação de teste pode não chegar.

---

## 6. Permissões

| Permissão | Para quê |
| --- | --- |
| Câmera | Ler o QR Code de login |
| Localização | Centralizar o mapa nos cadastros de pontos de interesse e cercas |
| Face ID / biometria | Manter o usuário conectado |
| Notificações | Push |
| Galeria (iOS) | Anexar imagens no sistema |
| Armazenamento (Android antigo) | Baixar relatórios |

**Nenhuma permissão é usada em segundo plano.** A localização é pedida só com o app aberto, nas telas de cadastro de
pontos de interesse e cercas.

Pontos de atenção:

- **iOS:** a Apple recusa apps com textos de permissão genéricos ou em outro idioma. Revise as chaves
  `NS...UsageDescription` no `Info.plist` e escreva o motivo real de cada uma, citando o nome do seu app. O texto
  `NSPhotoLibraryUsageDescription` está em inglês e deve ser trocado.
- **Android:** os títulos e mensagens em `src/components/permissoes.js` citam "SeeFlex". Troque pelo nome do seu app.
- Se o seu app não for usar algum recurso, não remova a permissão sem testar: o sistema web pode precisar dela em
  alguma tela.

---

## 7. Publicação na Play Store

### Chave de publicação

A chave identifica você como dono do app. **Se ela for perdida, não é possível atualizar o app na loja.** Guarde o arquivo
e as senhas em local seguro.

```sh
keytool -genkeypair -v -storetype PKCS12 -keystore android/app/my-release-key.keystore \
  -alias my-key-alias -keyalg RSA -keysize 2048 -validity 10000
```

Descomente e preencha as variáveis no final de `android/gradle.properties`:

```properties
MYAPP_UPLOAD_STORE_FILE=my-release-key.keystore
MYAPP_UPLOAD_KEY_ALIAS=my-key-alias
MYAPP_UPLOAD_STORE_PASSWORD=sua-senha
MYAPP_UPLOAD_KEY_PASSWORD=sua-senha
```

Sem essas variáveis, o build de release é assinado com a chave de debug, que a Play Store recusa.

O `.gitignore` já ignora arquivos `.keystore` (exceto o `debug.keystore`). Não versione a chave de publicação nem as senhas.

### Gerar o pacote

```sh
cd android && ./gradlew bundleRelease
```

O arquivo para enviar à Play Store fica em `android/app/build/outputs/bundle/release/app-release.aab`.

> Para validar o app antes de publicar, use o `bundleRelease` ou o `assembleRelease`. O `assembleDebug` não empacota o
> JavaScript, então não mostra erros que só aparecem na versão final.

### No Play Console

- Formulário de permissões: o app pede localização e câmera, e o Google pede a justificativa de cada uma.
- Política de privacidade: obrigatória, com link público.
- Acesso ao app: informe um usuário e senha de teste para a revisão do Google, já que o app exige login. Peça esse usuário
  à empresa dona do sistema e mantenha-o ativo durante toda a revisão.
- Segurança dos dados: veja a seção 9.

---

## 8. Publicação na App Store

1. Abra `ios/app_seeflex_exemplo.xcworkspace` no Xcode.
2. Em Signing & Capabilities, selecione o seu time e confira o Bundle ID e a capability Push Notifications.
3. Ajuste Version e Build em General.
4. Selecione "Any iOS Device" e use Product > Archive. Depois, Distribute App > App Store Connect.

Pontos de atenção:

- **Usuário de demonstração:** a Apple exige um login de teste em "App Review Information" no App Store Connect. Sem ele,
  o app é recusado. Peça esse usuário à empresa dona do sistema e mantenha-o ativo durante toda a revisão.
- **App que é só um site:** a Apple pode recusar apps que apenas exibem um site (diretriz 4.2). O app exemplo já tem
  recursos nativos (login, QR Code, biometria e push), e os apps feitos com esta base foram aprovados sem adaptações.
- **Ambiente do push:** o `app_seeflex_exemplo.entitlements` usa `aps-environment` = `development`. Com assinatura
  automática, o Xcode troca para `production` sozinho no Archive. Não precisa alterar.
- **Conexões HTTP:** o `Info.plist` libera conexões sem HTTPS (`NSAllowsArbitraryLoads`), porque o sistema web pode abrir
  conteúdos de terceiros. A Apple pode pedir justificativa na revisão.
- **Privacidade:** o `PrivacyInfo.xcprivacy` já declara as APIs usadas pelo React Native. Preencha no App Store Connect
  as informações de coleta de dados conforme a seção 9.

---

## 9. Privacidade (formulários das lojas)

Informações para preencher o "Segurança dos dados" da Google Play e o "Privacidade do app" da App Store:

| Pergunta | Resposta |
| --- | --- |
| Dados coletados pelo app | Localização precisa (só com o app em uso) e identificador do aparelho (token de push) |
| Para que são usados | Localização: centralizar o mapa nos cadastros. Token: enviar notificações |
| Localização em segundo plano | Não |
| Onde ficam os dados | O app não armazena dados. Os dados dos usuários ficam no sistema web |
| Exclusão de conta | O app não cria contas. Os usuários são cadastrados e excluídos pela empresa no sistema |
| SDKs de terceiros | Firebase Cloud Messaging (push) |
| Rastreamento para publicidade | Não |

A política de privacidade (link público) é da empresa dona do app.

---

## 10. Problemas comuns

| Problema | Causa provável |
| --- | --- |
| `File google-services.json is missing` | Arquivo fora de `android/app/` ou com outro nome |
| `No matching client found for package name` | `applicationId` diferente do package cadastrado no Firebase |
| App iOS fecha ao abrir | `GoogleService-Info.plist` ausente ou fora do target no Xcode |
| Push não chega no iPhone | Chave APNs não cadastrada no Firebase, capability Push Notifications desligada ou teste em simulador |
| Push não chega no Android | Permissão de notificação negada ou arquivo do Firebase de exemplo |
| Sininho aparece, mas a push de teste não chega | Migração do push ainda não concluída (seção 5) |
| Mudanças no JS não aparecem | Cache do Metro: rode `npx react-native start --reset-cache` |
| Erro de build no iOS depois de mudar dependências | Rode `bundle exec pod install` de novo na pasta `ios` |
