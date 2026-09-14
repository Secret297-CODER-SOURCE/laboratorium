/**
 * Fills every program's public course page (content-builder pages, same
 * system manuals/directions/groups use) with a detailed, multi-module
 * curriculum: overview, tools, one section per module (each with a topic
 * list), bonus/advanced topics, and career next-steps.
 *
 * Safe to re-run — savePage() replaces a target's sections/blocks wholesale
 * each time, so this always converges to exactly the content defined below.
 *
 * Usage: node server/scripts/seed-course-content.js
 */
import db from '../db/index.js';
import * as contentService from '../services/content.service.js';

function heading(text, level = 2) {
  return { block_type: 'heading', data: { level, text } };
}
function text(t) {
  return { block_type: 'text', data: { text: t } };
}
function list(items, style = 'bullet') {
  return { block_type: 'list', data: { style, items } };
}
function callout(title, text, variant = 'info') {
  return { block_type: 'callout', data: { variant, title, text } };
}
function cards(items) {
  return { block_type: 'cards', data: { items } };
}

function buildSections(course) {
  const sections = [];

  sections.push({
    title: 'Огляд курсу',
    icon: 'target',
    blocks: [
      text(course.overview),
      heading('Що ви отримаєте', 3),
      list(course.outcomes),
      heading('Інструменти та технології', 3),
      cards(course.tools.map((t) => ({ title: t, text: '', emoji: 'code' }))),
      ...(course.prerequisites ? [
        heading('Перед стартом', 3),
        list(course.prerequisites),
      ] : []),
    ],
  });

  course.modules.forEach((m, i) => {
    sections.push({
      title: `Модуль ${i + 1}. ${m.title}`,
      icon: m.icon || 'book',
      blocks: [
        text(m.intro),
        list(m.topics),
        ...(m.tip ? [callout('Практична порада', m.tip, 'info')] : []),
        ...(m.warning ? [callout('Важливо', m.warning, 'warning')] : []),
      ],
    });
  });

  sections.push({
    title: 'Додаткові та суміжні теми',
    icon: 'zap',
    blocks: [
      text('Понад базову програму курс торкається суміжних тем, які часто зустрічаються на практиці та підсилюють профіль спеціаліста.'),
      list(course.bonus),
    ],
  });

  sections.push({
    title: 'Що далі',
    icon: 'rocket',
    blocks: [
      heading('Кар\'єрні напрямки', 3),
      list(course.careers),
      heading('Рекомендовані сертифікації та практика', 3),
      list(course.nextSteps),
    ],
  });

  return sections;
}

const COURSES = {
  // ───────────────────────────── Offensive Security ─────────────────────────────
  offensive: {
    overview: 'Повний цикл пентесту — від розвідки та сканування до експлуатації, просування мережею та звітності. Курс побудований навколо реальної методології проведення тестування на проникнення (PTES, OWASP Testing Guide, MITRE ATT&CK) і максимально наближений до задач, які вирішує red team у комерційних проєктах.',
    outcomes: [
      'Вміння самостійно провести повний пентест від розвідки до звіту',
      'Розуміння методологій PTES, OSSTMM, MITRE ATT&CK та вміння їх застосовувати',
      'Практичні навички роботи з Metasploit, Burp Suite, BloodHound, Mimikatz',
      'Навички атак на Active Directory та lateral movement у корпоративних мережах',
      'Вміння писати професійний pentest-звіт із CVSS-оцінкою та рекомендаціями',
      'Готовність до складання OSCP/PNPT та участі у bug bounty програмах',
    ],
    tools: ['Nmap', 'Metasploit', 'Burp Suite', 'BloodHound', 'Mimikatz', 'Cobalt Strike (концептуально)', 'Impacket', 'Hashcat'],
    prerequisites: [
      'Впевнене користування Linux (командний рядок, права доступу, процеси)',
      'Базові знання мереж: TCP/IP, DNS, HTTP',
      'Бажано: досвід з курсу «Python для хакерів» для написання власних інструментів',
    ],
    modules: [
      {
        title: 'Методологія та правові основи пентесту',
        icon: 'shield',
        intro: 'Перед будь-якою технічною роботою пентестер має розуміти рамки, у яких діє — інакше законна перевірка перетворюється на кримінальний злочин.',
        topics: [
          'Методології PTES, OSSTMM, OWASP Testing Guide, NIST SP 800-115',
          'MITRE ATT&CK Framework як мова опису тактик і технік',
          'Rules of Engagement, Scope, Statement of Work',
          'Типи тестування: black/grey/white box, red team vs pentest',
          'Юридичні аспекти: письмовий дозвіл, NDA, межі відповідальності',
          'Формати співпраці із замовником та планування таймлайну проєкту',
        ],
      },
      {
        title: 'Розвідка (OSINT) та Passive Recon',
        icon: 'globe',
        intro: 'Розвідка — 50% успіху атаки. Що більше зібрано інформації до першого пакета в мережу клієнта, то ефективніша подальша експлуатація.',
        topics: [
          'Google Dorking та розширені оператори пошуку',
          'Shodan, Censys, ZoomEye — пошук відкритих сервісів та інфраструктури',
          'TheHarvester, Hunter.io — збір email та субдоменів',
          'Maltego — побудова графів зв\'язків організації',
          'Пошук у витоках даних (breach databases) та metadata файлів (exiftool, FOCA)',
          'Розвідка соціальних мереж та LinkedIn для соціальної інженерії',
          'Certificate Transparency logs для пошуку субдоменів',
        ],
        tip: 'Заведіть звичку документувати кожен знайдений артефакт одразу — на етапі звіту це заощадить години роботи.',
      },
      {
        title: 'Сканування та енумерація',
        icon: 'target',
        intro: 'Активна розвідка: перетворення списку IP/доменів на детальну карту сервісів, версій ПЗ та потенційних точок входу.',
        topics: [
          'Nmap: SYN/TCP/UDP-сканування, визначення версій та ОС, NSE-скрипти',
          'Masscan для швидкого сканування великих діапазонів',
          'Енумерація SMB (enum4linux, smbclient), FTP, SNMP, NFS',
          'DNS-енумерація: zone transfer, brute-force субдоменів (dnsenum, fierce)',
          'Банер-граббінг та fingerprinting сервісів вручну (netcat, telnet)',
          'Побудова карти атаки (attack surface mapping) за результатами сканування',
        ],
      },
      {
        title: 'Аналіз вразливостей',
        icon: 'warning',
        intro: 'Перетворення списку сервісів на пріоритезований список вразливостей, вартий подальшої експлуатації.',
        topics: [
          'Автоматизовані сканери: Nessus, OpenVAS, Nikto, Nuclei',
          'Робота з базами CVE, NVD, Exploit-DB',
          'CVSS 3.1: розрахунок і інтерпретація оцінки',
          'Фільтрація false positives та валідація знахідок вручну',
          'Пріоритизація вразливостей за критичністю та експлуатабельністю',
        ],
      },
      {
        title: 'Експлуатація та Metasploit Framework',
        icon: 'zap',
        intro: 'Перехід від теоретичної вразливості до практичного доступу до системи.',
        topics: [
          'Архітектура Metasploit: exploits, payloads, encoders, auxiliary-модулі',
          'Meterpreter: можливості та постексплуатаційні команди',
          'Ручна експлуатація без фреймворків — адаптація публічних PoC',
          'Основи переповнення буфера (buffer overflow) на практиці',
          'Генерація payload через msfvenom, обхід сигнатурного антивірусу',
          'Pivoting та tunneling через скомпрометований хост (proxychains, port forwarding)',
        ],
      },
      {
        title: 'Веб-експлуатація в контексті пентесту',
        icon: 'code',
        intro: 'Веб-застосунки — найпоширеніший вектор початкового доступу в сучасних інфраструктурах.',
        topics: [
          'Burp Suite Professional: Proxy, Repeater, Intruder, Extender',
          'SQL Injection: union-based, blind, time-based, обхід WAF',
          'Атаки на автентифікацію: brute-force, credential stuffing, обхід MFA',
          'SSRF та file upload вразливості як вектор RCE',
          'Chain exploitation: об\'єднання дрібних вразливостей у критичний ланцюг',
          'Використання sqlmap та інших автоматизованих інструментів',
        ],
      },
      {
        title: 'Атаки на Active Directory',
        icon: 'server',
        intro: 'Більшість корпоративних мереж побудовані на Active Directory — і саме тут відбувається основна частина lateral movement у реальних атаках.',
        topics: [
          'Enumeration AD: BloodHound, PowerView, net-команди',
          'Kerberoasting та AS-REP Roasting',
          'Pass-the-Hash, Pass-the-Ticket, Overpass-the-Hash',
          'Mimikatz: витяг credentials з LSASS, golden/silver ticket атаки',
          'Зловживання GPO, ACL misconfigurations, delegation-атаки',
          'Lateral movement: PsExec, WMI, WinRM',
          'Domain persistence техніки та DCSync',
        ],
        warning: 'Атаки на AD мають надзвичайно високий вплив на бізнес — завжди узгоджуйте exploitation-фазу з замовником окремо.',
      },
      {
        title: 'Post-exploitation та підвищення привілеїв',
        icon: 'lock',
        intro: 'Отримання доступу — це лише початок; справжня цінність пентесту в тому, наскільки далеко може просунутись атакуючий.',
        topics: [
          'Privilege escalation на Linux: SUID, cron jobs, kernel exploits, PATH hijacking',
          'Privilege escalation на Windows: misconfigured services, token impersonation, unquoted paths',
          'Persistence-техніки: scheduled tasks, реєстр, служби, SSH-ключі',
          'Обхід антивірусів та EDR: обфускація, AMSI bypass, process injection (концептуально)',
          'Основи Command & Control (C2) інфраструктури — Cobalt Strike, Sliver, Empire',
          'Data exfiltration техніки та приховування слідів',
        ],
      },
      {
        title: 'Wireless та фізична безпека',
        icon: 'zap',
        intro: 'Атаки виходять за межі мережевого периметра — Wi-Fi та фізичний доступ часто лишаються слабкою ланкою.',
        topics: [
          'WPA2/WPA3: handshake capture, offline brute-force (aircrack-ng, hashcat)',
          'Evil Twin атаки та rogue access points',
          'Bluetooth та BLE основи атак',
          'Клонування RFID/badge (базові принципи, Proxmark)',
          'Фізичний пентест: tailgating, lock picking basics, USB drop attacks',
        ],
      },
      {
        title: 'Соціальна інженерія',
        icon: 'user',
        intro: 'Людина залишається найслабшою ланкою будь-якої системи безпеки.',
        topics: [
          'Побудова фішингової кампанії у GoPhish',
          'Pretexting та психологічні прийоми маніпуляції',
          'Vishing (voice phishing) та smishing (SMS-фішинг)',
          'Клонування логін-сторінок для credential harvesting',
          'Метрики успішності кампанії та звітність перед клієнтом',
        ],
      },
      {
        title: 'Звітність та комунікація результатів',
        icon: 'notes',
        intro: 'Технічно ідеальний пентест без якісного звіту не має цінності для бізнесу замовника.',
        topics: [
          'Структура професійного pentest-звіту: executive summary, technical findings, remediation',
          'Формулювання ризиків мовою бізнесу, а не лише технічною',
          'CVSS-скоринг та пріоритизація рекомендацій',
          'Retest-процес та підтвердження усунення вразливостей',
          'Презентація результатів стейкхолдерам різного рівня',
        ],
      },
    ],
    bonus: [
      'Основи Cloud Pentesting (AWS/Azure misconfigurations, IAM-атаки)',
      'Container та Kubernetes security — вихід з контейнера, RBAC misconfig',
      'API pentesting: REST/GraphQL специфічні вразливості',
      'Основи мобільного пентесту (Android/iOS) — концептуальний вступ',
      'Purple Teaming — спільна робота red та blue team для підвищення детекції',
      'Adversary emulation за конкретними APT-групами (MITRE ATT&CK Navigator)',
      'Основи роботи з Bug Bounty платформами (HackerOne, Bugcrowd, Intigriti)',
    ],
    careers: [
      'Penetration Tester / Pentester',
      'Red Team Operator',
      'Security Consultant',
      'Bug Bounty Hunter',
      'Offensive Security Engineer',
    ],
    nextSteps: [
      'OSCP (Offensive Security Certified Professional) — індустріальний стандарт',
      'PNPT (Practical Network Penetration Tester)',
      'CEH (Certified Ethical Hacker) — теоретична база',
      'Практика на Hack The Box, TryHackMe, VulnHub',
      'Участь у CTF-змаганнях для відточення навичок під тиском часу',
    ],
  },

  // ───────────────────────────── Defensive Security ─────────────────────────────
  defensive: {
    overview: 'Курс готує фахівців Blue Team та SOC-аналітиків: моніторинг інфраструктури, виявлення атак, реагування на інциденти та цифрова форензика. Побудований навколо реальних процесів SOC — від збору логів до повного циклу Incident Response.',
    outcomes: [
      'Вміння будувати та налаштовувати SIEM-системи для моніторингу інфраструктури',
      'Навички виявлення атак за допомогою мережевого та host-based моніторингу',
      'Розуміння повного циклу Incident Response за стандартами NIST/SANS',
      'Практичні навички цифрової форензики (диск, пам\'ять, мережа)',
      'Вміння проводити Threat Hunting на основі гіпотез та MITRE ATT&CK',
      'Розуміння Compliance-вимог (ISO 27001, GDPR, PCI DSS) на базовому рівні',
    ],
    tools: ['Splunk', 'ELK Stack', 'Suricata/Snort', 'Wireshark', 'Volatility', 'Sysmon', 'MISP', 'TheHive'],
    prerequisites: [
      'Базове розуміння мереж (TCP/IP, DNS, HTTP)',
      'Впевнене користування Linux та Windows на рівні адміністратора',
    ],
    modules: [
      {
        title: 'Основи Blue Team та Defense in Depth',
        icon: 'shield',
        intro: 'Формування системного мислення про захист інфраструктури — від периметра до даних.',
        topics: [
          'Cyber Kill Chain та Diamond Model as основи аналізу атак',
          'MITRE ATT&CK Framework з погляду захисника (детекція технік)',
          'Принцип Defense in Depth: мережевий, host, application, data рівні',
          'Zero Trust архітектура — базові принципи',
          'Побудова моделі загроз (threat modeling) для організації',
        ],
      },
      {
        title: 'SIEM та централізоване логування',
        icon: 'server',
        intro: 'SIEM — центральна нервова система SOC: без якісного збору логів жодна детекція неможлива.',
        topics: [
          'Архітектура Splunk: forwarders, indexers, search heads',
          'ELK Stack: Elasticsearch, Logstash, Kibana — налаштування пайплайну',
          'Sysmon: конфігурація для збору детальних Windows-подій',
          'Написання кореляційних правил для виявлення підозрілої активності',
          'Log parsing, normalization та retention policy',
          'Робота з Windows Event Log ID (4624, 4688, 4720 та інші ключові події)',
        ],
      },
      {
        title: 'Мережевий моніторинг та IDS/IPS',
        icon: 'globe',
        intro: 'Виявлення атак на рівні мережевого трафіку до того, як вони досягнуть кінцевої точки.',
        topics: [
          'Snort/Suricata: сигнатурне виявлення, написання власних правил',
          'Аналіз трафіку у Wireshark: виявлення сканувань, ексфільтрації, C2-трафіку',
          'NetFlow/sFlow аналіз для виявлення аномалій',
          'DNS-моніторинг як індикатор компрометації (DGA-домени, тунелювання)',
          'TLS-інспекція та обмеження видимості в зашифрованому трафіку',
        ],
      },
      {
        title: 'Endpoint Detection & Response',
        icon: 'lock',
        intro: 'Моніторинг та реагування безпосередньо на кінцевих точках, де відбувається основна частина атаки.',
        topics: [
          'Архітектура EDR-рішень та принципи поведінкового аналізу',
          'Виявлення аномальних процесів, LOLBins (Living off the Land Binaries)',
          'Process injection, persistence-техніки з погляду детекції',
          'Кореляція host-based та network-based індикаторів',
          'Автоматизована ізоляція скомпрометованого хоста',
        ],
      },
      {
        title: 'Threat Intelligence',
        icon: 'target',
        intro: 'Перетворення зовнішньої інформації про загрози на дієві правила детекції.',
        topics: [
          'Типи Threat Intel: стратегічний, оперативний, тактичний, технічний',
          'IOC (Indicators of Compromise) та TTPs (Tactics, Techniques, Procedures)',
          'Робота з MISP для обміну індикаторами',
          'Threat feeds та інтеграція з SIEM',
          'Атрибуція атак та профілювання APT-груп',
        ],
      },
      {
        title: 'Incident Response',
        icon: 'warning',
        intro: 'Структурований підхід до реагування на інцидент — від виявлення до відновлення нормальної роботи.',
        topics: [
          'NIST SP 800-61 та SANS PICERL моделі Incident Response',
          'Тріаж інциденту та класифікація за критичністю',
          'Ізоляція та стримування (containment) без втрати доказів',
          'Комунікаційний план під час інциденту (внутрішній/зовнішній)',
          'Post-incident review та Lessons Learned',
          'Побудова та підтримка Incident Response Plan для організації',
        ],
        tip: 'Завжди документуйте таймлайн дій під час реагування — це критично для подальшого розслідування та звітності.',
      },
      {
        title: 'Цифрова форензика',
        icon: 'notes',
        intro: 'Глибоке розслідування інциденту через аналіз артефактів системи.',
        topics: [
          'Створення форензичних образів диску (dd, FTK Imager) зі збереженням chain of custody',
          'Аналіз пам\'яті через Volatility: пошук процесів, injected code, credentials',
          'Артефакти Windows: Prefetch, реєстр, Event Log, $MFT, Amcache',
          'Артефакти Linux: bash history, auth.log, /proc, cron',
          'Побудова timeline інциденту (Plaso, log2timeline)',
          'Мережева форензика: відновлення сесій із pcap-файлів',
        ],
      },
      {
        title: 'Аналіз шкідливого ПЗ для Blue Team',
        icon: 'code',
        intro: 'Базові навички аналізу malware, достатні для виявлення поведінки та побудови сигнатур.',
        topics: [
          'Статичний аналіз: хеші, strings, PE-заголовки, YARA-правила',
          'Динамічний аналіз у sandbox (Any.Run, Cuckoo Sandbox)',
          'Виявлення C2-комунікації та поведінкових індикаторів',
          'Основи класифікації malware (ransomware, trojan, worm, rootkit)',
        ],
      },
      {
        title: 'Vulnerability Management',
        icon: 'target',
        intro: 'Проактивне управління вразливостями як частина щоденної роботи Blue Team.',
        topics: [
          'Побудова циклу vulnerability management: scan → assess → remediate → verify',
          'Пріоритизація на основі ризику, а не лише CVSS-оцінки',
          'Інтеграція сканування у CI/CD пайплайн',
          'Patch management стратегії для production-середовищ',
        ],
      },
      {
        title: 'Hardening та Compliance',
        icon: 'shield',
        intro: 'Зменшення поверхні атаки через системне підвищення захищеності інфраструктури.',
        topics: [
          'CIS Benchmarks для Windows/Linux серверів',
          'Базові вимоги ISO 27001 та побудова ISMS',
          'GDPR та PCI DSS: ключові вимоги з погляду технічного фахівця',
          'Security baseline та автоматизація перевірки конфігурацій',
        ],
      },
      {
        title: 'Threat Hunting',
        icon: 'target',
        intro: 'Проактивний пошук загроз, які не спрацювали автоматичні правила детекції.',
        topics: [
          'Формування гіпотез на основі MITRE ATT&CK Navigator',
          'Hunting за аномаліями в аутентифікації та привілейованих діях',
          'Використання SIEM для ad-hoc пошукових запитів',
          'Документування та перетворення знахідок у постійні правила детекції',
        ],
      },
    ],
    bonus: [
      'Основи SOAR (Security Orchestration, Automation and Response) та плейбуки',
      'Cloud Security Monitoring (AWS CloudTrail, Azure Sentinel базово)',
      'Purple Teaming — спільні навчання з offensive-командою',
      'Deception-технології: honeypots, honeytokens',
      'Insider Threat detection — специфіка виявлення внутрішніх загроз',
      'Основи роботи з TheHive та Cortex для управління інцидентами',
    ],
    careers: [
      'SOC Analyst (Tier 1/2/3)',
      'Incident Responder',
      'Threat Hunter',
      'Digital Forensics Analyst',
      'Blue Team Engineer',
    ],
    nextSteps: [
      'GCIH (GIAC Certified Incident Handler)',
      'GCFA (GIAC Certified Forensic Analyst)',
      'CompTIA CySA+ — хороший старт для junior-позицій',
      'Blue Team Labs Online, LetsDefend для практики',
      'Участь у Defensive CTF (blue-team-орієнтовані змагання)',
    ],
  },

  // ───────────────────────────── Python для хакерів ─────────────────────────────
  python: {
    overview: 'Практичний курс Python з фокусом на автоматизацію рутинних задач пентестера: власні сканери, OSINT-скрипти, робота з мережею та експлойтами. Від синтаксису з нуля до написання повноцінних CLI-інструментів для безпеки.',
    outcomes: [
      'Впевнене володіння Python 3: синтаксис, ООП, робота з бібліотеками',
      'Вміння писати власні мережеві сканери та інструменти енумерації',
      'Навички автоматизації OSINT-розвідки та парсингу даних',
      'Базові навички написання експлойтів з pwntools',
      'Вміння інтегруватись з API безпекових сервісів (Shodan, VirusTotal)',
      'Готовність оформити власний інструмент як CLI-утиліту та опублікувати',
    ],
    tools: ['Python 3', 'Requests', 'Scapy', 'Pwntools', 'BeautifulSoup', 'Argparse', 'SQLite', 'Socket'],
    modules: [
      {
        title: 'Основи Python з нуля',
        icon: 'code',
        intro: 'Фундамент, без якого неможливо рухатись далі — синтаксис, типи даних, керування потоком виконання.',
        topics: [
          'Змінні, типи даних, оператори, умовні конструкції',
          'Цикли, функції, аргументи за замовчуванням та *args/**kwargs',
          'Структури даних: списки, кортежі, словники, множини',
          'Робота з рядками, форматування (f-strings), regex-основи',
          'Обробка виключень (try/except) та власні винятки',
          'ООП базово: класи, методи, атрибути, успадкування',
        ],
      },
      {
        title: 'Робота з файлами та системою',
        icon: 'notes',
        intro: 'Автоматизація локальних задач — основа будь-якого CLI-інструменту.',
        topics: [
          'Читання/запис файлів, контекстні менеджери (with)',
          'Модуль os, pathlib для роботи з файловою системою',
          'Модуль subprocess для виклику зовнішніх команд',
          'Робота з аргументами командного рядка через argparse',
          'Логування через модуль logging замість print()',
        ],
      },
      {
        title: 'Мережеве програмування',
        icon: 'globe',
        intro: 'Розуміння мережі на рівні сокетів — база для написання власних сканерів та експлойтів.',
        topics: [
          'Модуль socket: TCP/UDP клієнти та сервери',
          'Написання простого port-сканера з нуля',
          'Robота з HTTP через requests: сесії, заголовки, cookies, proxies',
          'Основи Scapy: створення та аналіз пакетів',
          'Написання ARP-сканера та простого sniffer\'а на Scapy',
        ],
      },
      {
        title: 'OSINT-автоматизація та парсинг',
        icon: 'target',
        intro: 'Автоматизація рутинної розвідки, яку вручну робити довго та неефективно.',
        topics: [
          'BeautifulSoup та lxml для парсингу HTML',
          'Робота з API: автентифікація, rate limiting, pagination',
          'Автоматизований збір субдоменів та email-адрес',
          'Regex для витягу структурованих даних із неструктурованого тексту',
          'Збереження результатів у CSV/JSON/SQLite для подальшого аналізу',
        ],
      },
      {
        title: 'Написання власних сканерів',
        icon: 'target',
        intro: 'Практичне застосування мережевих знань — інструменти, які реально використовує пентестер.',
        topics: [
          'Багатопотоковий port scanner (threading/concurrent.futures)',
          'Банер-граббінг та визначення версій сервісів',
          'Простий web-directory bruteforcer',
          'Інтеграція результатів сканування у звіт (генерація HTML/Markdown)',
        ],
        tip: 'Пишіть інструменти з думкою про повторне використання — оформлюйте логіку у функції/класи, а не «спагеті-код».',
      },
      {
        title: 'Multithreading та Multiprocessing',
        icon: 'zap',
        intro: 'Швидкість — критична вимога до інструментів пентестера при роботі з великими діапазонами цілей.',
        topics: [
          'Відмінності Threading vs Multiprocessing vs Asyncio в Python',
          'GIL (Global Interpreter Lock) та його вплив на продуктивність',
          'concurrent.futures.ThreadPoolExecutor для паралельних задач',
          'asyncio та aiohttp для асинхронних мережевих запитів',
          'Оптимізація швидкодії сканерів через паралелізацію',
        ],
      },
      {
        title: 'Основи роботи з експлойтами',
        icon: 'lock',
        intro: 'Вступ до exploit development через Python-інструментарій.',
        topics: [
          'Pwntools: базові можливості для роботи з бінарними вразливостями',
          'Написання простого exploit-скрипта для buffer overflow (навчальний приклад)',
          'Робота з shellcode: генерація через msfvenom, інтеграція в Python',
          'Автоматизація взаємодії з віддаленим сервісом (pwntools.remote)',
        ],
      },
      {
        title: 'Криптографія на Python',
        icon: 'lock',
        intro: 'Практичне розуміння криптографії через код, а не лише теорію.',
        topics: [
          'Модуль hashlib: MD5, SHA-родина, застосування та обмеження',
          'Симетричне шифрування через cryptography/PyCryptodome',
          'Базовий частотний аналіз та атака на класичні шифри (Цезар, Віженер)',
          'Робота з base64/hex кодуванням у контексті CTF-задач',
        ],
      },
      {
        title: 'Інтеграція з API безпеки',
        icon: 'server',
        intro: 'Об\'єднання власних інструментів із зовнішніми джерелами даних про загрози.',
        topics: [
          'Shodan API: пошук пристроїв та сервісів програмно',
          'VirusTotal API: перевірка хешів, URL, файлів',
          'AbuseIPDB та інші reputation-сервіси',
          'Побудова власного агрегатора даних з кількох джерел',
        ],
      },
      {
        title: 'Оформлення власного CLI-інструменту',
        icon: 'notes',
        intro: 'Перетворення робочого скрипта на професійний, придатний до розповсюдження інструмент.',
        topics: [
          'Структура Python-пакету, requirements.txt, virtualenv',
          'Просунутий argparse або click для зручного CLI',
          'Документування коду та README для GitHub',
          'Публікація інструменту на PyPI (базово)',
          'Основи написання unit-тестів (pytest) для власних інструментів',
        ],
      },
    ],
    bonus: [
      'Написання власних Burp Suite розширень на Python (Jython) — концептуально',
      'Web scraping з обходом anti-bot захисту (Selenium, Playwright)',
      'Основи Machine Learning для аналізу аномалій у логах (вступ)',
      'Автоматизація Active Directory enumeration через impacket-бібліотеки',
      'Написання Discord/Telegram-ботів для сповіщень про результати сканування',
    ],
    careers: [
      'Security Automation Engineer',
      'Python Developer у security-командах',
      'Tool Developer для red/blue team',
      'Junior Penetration Tester з ухилом у скриптинг',
    ],
    nextSteps: [
      'Поглиблене вивчення курсу «Offensive Security» для застосування навичок на практиці',
      'Внесок у open-source security-інструменти на GitHub',
      'Участь у CTF з написанням власних solver-скриптів',
      'Python-орієнтовані challenges на HackTheBox/TryHackMe',
    ],
  },

  // ───────────────────────────── Reverse Engineering ─────────────────────────────
  reverse: {
    overview: 'Глибоке занурення у reverse engineering: від асемблера та форматів виконуваних файлів до аналізу шкідливого ПЗ та експлуатації бінарних вразливостей. Курс поєднує статичний та динамічний аналіз на реальних прикладах.',
    outcomes: [
      'Впевнене читання асемблера x86/x64 та розуміння calling conventions',
      'Навички статичного аналізу в IDA Pro/Ghidra',
      'Навички динамічного аналізу через дебагери (x64dbg, GDB)',
      'Вміння аналізувати та обходити базові anti-debugging техніки',
      'Базові навички аналізу шкідливого ПЗ у ізольованому середовищі',
      'Розуміння механізмів експлуатації бінарних вразливостей',
    ],
    tools: ['IDA Pro', 'Ghidra', 'x64dbg', 'GDB', 'Binwalk', 'radare2', 'Wireshark'],
    prerequisites: [
      'Базові знання C/C++ (бажано, полегшить розуміння асемблера)',
      'Розуміння роботи операційних систем на базовому рівні',
    ],
    modules: [
      {
        title: 'Основи асемблера x86/x64',
        icon: 'code',
        intro: 'Асемблер — мова, якою «говорить» будь-яка скомпільована програма. Без нього неможливий жоден серйозний RE.',
        topics: [
          'Регістри загального призначення, прапорці, стек',
          'Основні інструкції: mov, push/pop, jmp, call/ret, арифметичні операції',
          'Calling conventions: cdecl, stdcall, fastcall, x64 System V/Microsoft ABI',
          'Умовні переходи та відновлення логіки if/else, циклів з асемблера',
          'Робота зі стековими фреймами та локальними змінними',
        ],
      },
      {
        title: 'Формати виконуваних файлів',
        icon: 'notes',
        intro: 'Розуміння структури файлу — перший крок будь-якого аналізу.',
        topics: [
          'PE-формат (Windows): заголовки, секції, import/export table',
          'ELF-формат (Linux): заголовки, секції, символи, динамічне зв\'язування',
          'Relocations та як завантажувач працює з адресами',
          'Аналіз файлу через інструменти: file, readelf, PEview, CFF Explorer',
        ],
      },
      {
        title: 'Статичний аналіз',
        icon: 'target',
        intro: 'Аналіз програми без її запуску — розуміння логіки через дизасембльований код.',
        topics: [
          'Робота з IDA Pro: навігація, перейменування, коментування, графи функцій',
          'Ghidra: декомпіляція у псевдо-C, робота з базою даних проєкту',
          'Ідентифікація стандартних бібліотечних функцій (FLIRT-сигнатури)',
          'Відновлення структур даних та типів зі скомпільованого коду',
          'Cross-references (xrefs) для розуміння потоку виконання',
        ],
      },
      {
        title: 'Динамічний аналіз',
        icon: 'zap',
        intro: 'Спостереження за поведінкою програми в реальному часі — доповнює статичний аналіз там, де код заплутаний.',
        topics: [
          'x64dbg: брейкпоінти, трасування, модифікація пам\'яті на льоту',
          'GDB для Linux-бінарників: команди, скриптинг через Python (gdb-python)',
          'Апаратні vs програмні брейкпоінти',
          'Аналіз системних викликів (strace/ltrace на Linux, API Monitor на Windows)',
          'Поєднання статичного та динамічного аналізу для швидшого розуміння логіки',
        ],
      },
      {
        title: 'Аналіз crackme та алгоритмів перевірки',
        icon: 'lock',
        intro: 'Класична задача RE — знайти та зрозуміти алгоритм перевірки ліцензійного ключа чи пароля.',
        topics: [
          'Пошук точки перевірки через рядкові константи та xrefs',
          'Патерни serial/license-перевірок',
          'Патчинг бінарника: зміна умовних переходів, NOP-заповнення',
          'Написання keygen на основі відновленого алгоритму',
        ],
        tip: 'Завжди працюйте з копією файлу — патчинг та експериментальний запуск оригіналу можуть пошкодити систему.',
      },
      {
        title: 'Обфускація та anti-debugging техніки',
        icon: 'shield',
        intro: 'Реальне шкідливе ПЗ та комерційний софт активно протидіють аналізу — важливо вміти це розпізнавати й обходити.',
        topics: [
          'Виявлення дебагера: IsDebuggerPresent, timing-атаки, PEB-перевірки',
          'Packers та unpacking (UPX як базовий приклад)',
          'Code obfuscation: junk-код, control flow flattening',
          'Anti-VM та anti-sandbox техніки',
          'Базові техніки обходу для навчальних цілей',
        ],
      },
      {
        title: 'Аналіз шкідливого ПЗ (Malware RE)',
        icon: 'warning',
        intro: 'Застосування навичок RE до реальної задачі — розуміння того, що робить конкретний зразок malware.',
        topics: [
          'Безпечне середовище для аналізу: ізольовані ВМ, snapshot-стратегія',
          'Статичні індикатори: strings, imphash, YARA-правила',
          'Динамічний аналіз у sandbox (Any.Run, Cuckoo Sandbox)',
          'Виявлення мережевих індикаторів (C2-адреси, User-Agent)',
          'Базова класифікація: trojan, ransomware, dropper, backdoor',
        ],
        warning: 'Ніколи не запускайте невідомі зразки поза ізольованим, повністю відключеним від продакшн-мережі середовищем.',
      },
      {
        title: 'Експлуатація бінарних вразливостей',
        icon: 'zap',
        intro: 'Перехід від пасивного аналізу до активної експлуатації знайдених вразливостей у бінарному коді.',
        topics: [
          'Stack-based buffer overflow: від краху до контролю EIP/RIP',
          'Побудова базового exploit\'а з shellcode',
          'Захисні механізми: Stack Canaries, ASLR, DEP/NX, як вони працюють',
          'Вступ до ROP (Return Oriented Programming) для обходу DEP',
          'Format string вразливості та їх експлуатація',
        ],
      },
      {
        title: 'Reverse Engineering мобільних застосунків',
        icon: 'user',
        intro: 'Специфіка аналізу Android/iOS-застосунків суттєво відрізняється від класичного desktop RE.',
        topics: [
          'Декомпіляція APK: jadx, apktool, розбір Smali-коду',
          'Аналіз AndroidManifest.xml та permissions',
          'Динамічний аналіз через Frida (hooking функцій у реальному часі)',
          'Базовий вступ до аналізу iOS IPA-файлів',
        ],
      },
      {
        title: 'Firmware та embedded RE',
        icon: 'server',
        intro: 'Аналіз прошивок IoT-пристроїв та вбудованих систем — окрема, швидкозростаюча галузь RE.',
        topics: [
          'Binwalk для розпакування та аналізу прошивок',
          'Пошук файлової системи та ключових конфігураційних файлів у прошивці',
          'Базовий аналіз ARM/MIPS асемблера (відмінності від x86)',
          'UART/JTAG як точки доступу до апаратного аналізу (концептуально)',
        ],
      },
    ],
    bonus: [
      'Основи символьного виконання (symbolic execution) та angr',
      'Fuzzing як метод пошуку вразливостей (AFL++, основи)',
      'Аналіз .NET та Java байткоду (dnSpy, JD-GUI)',
      'CTF pwn-задачі як практичний тренажер навичок',
      'Основи side-channel атак (концептуальний вступ)',
    ],
    careers: [
      'Malware Analyst',
      'Reverse Engineer',
      'Exploit Developer',
      'Vulnerability Researcher',
      'Firmware Security Engineer',
    ],
    nextSteps: [
      'GREM (GIAC Reverse Engineering Malware)',
      'OSED (Offensive Security Exploitation Expert) для поглиблення exploit dev',
      'Практика на crackmes.one та pwn-розділах CTF',
      'Аналіз реальних (безпечних, навчальних) зразків із MalwareBazaar',
    ],
  },

  // ───────────────────────────── Web Security ─────────────────────────────
  web: {
    overview: 'Детальний розбір веб-вразливостей за методологією OWASP Top 10 та поза нею — з фокусом на практичну експлуатацію, bug bounty методологію та безпечне написання коду. Найкращий старт у кібербезпеку для тих, хто вже знайомий з веб-розробкою.',
    outcomes: [
      'Глибоке розуміння OWASP Top 10 з практичною експлуатацією кожного пункту',
      'Впевнене володіння Burp Suite для пошуку та експлуатації вразливостей',
      'Навички проведення bug bounty розвідки та побудови методології',
      'Розуміння API Security (REST/GraphQL) вразливостей',
      'Базові навички secure code review',
      'Готовність почати кар\'єру у web application security',
    ],
    tools: ['Burp Suite', 'OWASP ZAP', 'sqlmap', 'ffuf', 'Nuclei', 'Postman', 'Browser DevTools'],
    modules: [
      {
        title: 'OWASP Top 10: детальний розбір',
        icon: 'shield',
        intro: 'Систематичний огляд найпоширеніших класів веб-вразливостей як фундамент курсу.',
        topics: [
          'Broken Access Control, Cryptographic Failures, Injection',
          'Insecure Design, Security Misconfiguration',
          'Vulnerable Components, Auth Failures',
          'Software/Data Integrity Failures, Logging Failures, SSRF',
          'Методологія тестування кожної категорії на практиці',
        ],
      },
      {
        title: 'Injection-атаки',
        icon: 'code',
        intro: 'Найстаріший, але досі надзвичайно поширений клас вразливостей.',
        topics: [
          'SQL Injection: union-based, error-based, blind (boolean/time-based)',
          'Обхід WAF та фільтрів при SQLi',
          'NoSQL Injection (MongoDB та подібні)',
          'Command Injection та OS Command Injection',
          'Template Injection (SSTI) у поширених шаблонізаторах',
          'Автоматизація через sqlmap: tamper-скрипти, рівні агресивності',
        ],
      },
      {
        title: 'Cross-Site Scripting (XSS)',
        icon: 'zap',
        intro: 'Клієнтська вразливість №1 — від дефейсу до повного захоплення сесії адміністратора.',
        topics: [
          'Reflected, Stored та DOM-based XSS',
          'Обхід фільтрів та санітизації (encoding tricks, event handlers)',
          'Content Security Policy (CSP) та техніки її обходу',
          'Blind XSS та інструменти детекції (XSS Hunter)',
          'Побудова payload для крадіжки cookies/session tokens',
        ],
      },
      {
        title: 'Автентифікація та управління сесіями',
        icon: 'lock',
        intro: 'Вразливості на рівні «хто ти є» часто мають найвищий бізнес-вплив.',
        topics: [
          'Broken Authentication: brute-force, credential stuffing, weak lockout',
          'Session Fixation, session hijacking',
          'JWT-атаки: alg confusion, weak secret, none algorithm',
          'OAuth2/OpenID Connect типові помилки конфігурації',
          'Обхід Multi-Factor Authentication (логічні вразливості)',
        ],
      },
      {
        title: 'SSRF та XXE',
        icon: 'target',
        intro: 'Вразливості, що дозволяють серверу «атакувати самого себе» або внутрішню мережу.',
        topics: [
          'Server-Side Request Forgery: базові та blind-сценарії',
          'Обхід SSRF-фільтрів (redirect chains, DNS rebinding, alternative IP-формати)',
          'Атаки на cloud metadata endpoints через SSRF',
          'XML External Entity (XXE): читання файлів, SSRF через XXE',
          'Обхід захисту XXE (blind XXE, OOB-техніки)',
        ],
      },
      {
        title: 'IDOR та Broken Access Control',
        icon: 'lock',
        intro: 'Найпростіші для розуміння, але надзвичайно поширені та впливові вразливості.',
        topics: [
          'Insecure Direct Object Reference: горизонтальна та вертикальна ескалація',
          'Мапінг ролей та прав доступу застосунку',
          'Mass Assignment вразливості',
          'Тестування API endpoints на відсутність перевірки авторизації',
          'Методологія систематичного тестування access control',
        ],
      },
      {
        title: 'API Security',
        icon: 'server',
        intro: 'Сучасні застосунки — це передусім API, і вони мають власний клас специфічних вразливостей.',
        topics: [
          'OWASP API Security Top 10',
          'REST API: excessive data exposure, rate limiting bypass',
          'GraphQL-специфічні вразливості: introspection, batching attacks, depth limiting',
          'API-версіонування та проблеми зворотної сумісності з точки зору безпеки',
          'Тестування API через Postman/Burp Suite',
        ],
      },
      {
        title: 'Client-side атаки',
        icon: 'user',
        intro: 'Вразливості, що експлуатуються безпосередньо в браузері жертви.',
        topics: [
          'CORS misconfiguration та її експлуатація',
          'Clickjacking та захист через X-Frame-Options/CSP',
          'postMessage() вразливості між вікнами/iframe',
          'Prototype Pollution у JavaScript',
          'Open Redirect та його використання у фішингових ланцюгах',
        ],
      },
      {
        title: 'Інструменти пентестера веб-застосунків',
        icon: 'code',
        intro: 'Практична майстерність роботи з ключовим інструментарієм індустрії.',
        topics: [
          'Burp Suite Professional: Intruder-атаки, Extender/плагіни, Collaborator',
          'OWASP ZAP як безкоштовна альтернатива',
          'ffuf/gobuster для directory/parameter fuzzing',
          'Nuclei для швидкого сканування за шаблонами',
          'Робота з браузерними DevTools для аналізу клієнтської логіки',
        ],
      },
      {
        title: 'Bug Bounty методологія',
        icon: 'target',
        intro: 'Перехід від навчальних лабораторій до реальних програм винагороди за вразливості.',
        topics: [
          'Recon для web: subdomain enumeration, wayback machine, content discovery',
          'Побудова особистої методології тестування (чекліст)',
          'Написання якісного звіту про вразливість (PoC, impact, remediation)',
          'Огляд платформ: HackerOne, Bugcrowd, Intigriti',
          'Етика та правила відповідального розкриття (responsible disclosure)',
        ],
      },
      {
        title: 'Secure Coding',
        icon: 'shield',
        intro: 'Погляд з іншого боку — як писати код, що не потрапить у звіт пентестера.',
        topics: [
          'Parametrized queries та ORM для захисту від SQLi',
          'Output encoding та контекстно-залежна санітизація для XSS',
          'Принципи Secure by Design та Least Privilege',
          'Основи code review з фокусом на security-паттерни',
          'Впровадження security-перевірок у CI/CD (SAST/DAST базово)',
        ],
      },
    ],
    bonus: [
      'WebSocket security — специфічні вразливості реального часу',
      'Атаки на Single Sign-On (SAML) інтеграції',
      'Race Condition вразливості у веб-застосунках',
      'HTTP Request Smuggling — просунута тема',
      'Основи Web Application Firewall (WAF) та техніки його обходу',
      'Business Logic вразливості — вразливості, які не ловить жоден сканер',
    ],
    careers: [
      'Web Application Penetration Tester',
      'Bug Bounty Hunter',
      'Application Security Engineer (AppSec)',
      'Security Researcher',
    ],
    nextSteps: [
      'eWPT/eWPTX (eLearnSecurity Web Penetration Tester)',
      'OSWE (Offensive Security Web Expert) — поглиблений рівень',
      'PortSwigger Web Security Academy — безкоштовна практика від творців Burp Suite',
      'Активна участь у публічних bug bounty програмах',
    ],
  },

  // ───────────────────────────── Systems Programming (C/C++) ─────────────────────────────
  systems: {
    overview: 'Курс системного програмування на C/C++: від роботи з пам\'яттю на найнижчому рівні до багатопотокових мережевих застосунків. Фундамент, необхідний для reverse engineering, exploit development та розуміння того, як насправді працює комп\'ютер.',
    outcomes: [
      'Впевнене володіння C та об\'єктно-орієнтованим C++',
      'Глибоке розуміння управління пам\'яттю та типових помилок',
      'Навички багатопотокового програмування та синхронізації',
      'Вміння писати мережеві застосунки на низькому рівні',
      'Базове розуміння основ exploit development (stack overflow, шелкод)',
      'Навички роботи зі збіркою: Makefile, CMake, лінкування',
    ],
    tools: ['GCC/Clang', 'GDB', 'Valgrind', 'CMake', 'Make', 'pthreads', 'Wireshark'],
    prerequisites: [
      'Базове розуміння програмування бажане (будь-яка мова)',
      'Логічне мислення та готовність працювати з низькорівневими концепціями',
    ],
    modules: [
      {
        title: 'Основи C',
        icon: 'code',
        intro: 'C — мова, що дає прямий контроль над пам\'яттю та є основою більшості системного ПЗ.',
        topics: [
          'Типи даних, оператори, керуючі конструкції',
          'Вказівники: адреси, розіменування, арифметика вказівників',
          'Масиви та їхній зв\'язок із вказівниками',
          'Функції, передача параметрів за значенням/посиланням (через вказівники)',
          'Структури (struct) та об\'єднання (union)',
        ],
      },
      {
        title: 'Управління пам\'яттю',
        icon: 'lock',
        intro: 'Найважливіша і найнебезпечніша тема C/C++ — ручне керування пам\'яттю.',
        topics: [
          'malloc/calloc/realloc/free — динамічне виділення пам\'яті',
          'Типові помилки: memory leaks, use-after-free, double-free, buffer overflow',
          'Stack vs Heap: відмінності, коли що використовувати',
          'Валідація коду через Valgrind, AddressSanitizer',
          'Розуміння layout пам\'яті процесу (.text, .data, .bss, heap, stack)',
        ],
        warning: 'Помилки управління пам\'яттю — основне джерело критичних вразливостей у реальному ПЗ. Тестуйте кожен malloc/free.',
      },
      {
        title: 'ООП у C++',
        icon: 'code',
        intro: 'C++ додає до C потужну об\'єктно-орієнтовану модель без втрати низькорівневого контролю.',
        topics: [
          'Класи, конструктори/деструктори, модифікатори доступу',
          'Успадкування, поліморфізм, віртуальні функції',
          'RAII (Resource Acquisition Is Initialization) — ідіома управління ресурсами',
          'Розумні вказівники: unique_ptr, shared_ptr, weak_ptr',
          'Шаблони (templates) та основи узагальненого програмування',
          'STL: vector, map, string та інші базові контейнери',
        ],
      },
      {
        title: 'Робота з файловою системою та I/O',
        icon: 'notes',
        intro: 'Взаємодія програми із зовнішнім світом через файли та потоки.',
        topics: [
          'Низькорівневі системні виклики: open/read/write/close',
          'Буферизований I/O через стандартну бібліотеку (fopen/fread/fwrite)',
          'Робота з бінарними файлами та структурованими даними',
          'File descriptors та їхня роль в Unix-подібних системах',
        ],
      },
      {
        title: 'Багатопотоковість',
        icon: 'zap',
        intro: 'Сучасне ПЗ рідко буває однопотоковим — розуміння паралелізму критичне для системного програміста.',
        topics: [
          'POSIX Threads (pthreads): створення, join, detach',
          'std::thread у сучасному C++',
          'Синхронізація: мьютекси, семафори, умовні змінні',
          'Race conditions, deadlocks та способи їх уникнення',
          'Атомарні операції (std::atomic) для lock-free програмування',
        ],
      },
      {
        title: 'Мережеве програмування на C/C++',
        icon: 'globe',
        intro: 'Написання мережевих застосунків безпосередньо через системні сокети — база для розуміння того, що ховається під requests/socket-бібліотеками високорівневих мов.',
        topics: [
          'Berkeley Sockets API: socket/bind/listen/accept/connect',
          'TCP vs UDP на рівні реалізації клієнт-сервер застосунків',
          'Написання простого багатопотокового TCP-сервера',
          'Обробка часткових read/write та мережевих помилок',
          'Основи select()/poll()/epoll() для мультиплексування з\'єднань',
        ],
      },
      {
        title: 'Структури даних та алгоритми',
        icon: 'target',
        intro: 'Реалізація класичних структур даних вручну для глибокого розуміння їх внутрішньої роботи.',
        topics: [
          'Зв\'язні списки, стеки, черги — реалізація з нуля на вказівниках',
          'Бінарні дерева пошуку, основи балансування',
          'Хеш-таблиці: принцип роботи, обробка колізій',
          'Складність алгоритмів (Big O) на практичних прикладах',
          'Сортування та пошук: реалізація ключових алгоритмів',
        ],
      },
      {
        title: 'Компіляція та лінкування',
        icon: 'server',
        intro: 'Розуміння того, що відбувається між написанням коду та запуском виконуваного файлу.',
        topics: [
          'Етапи компіляції: препроцесор, компілятор, асемблер, лінкер',
          'Статичні vs динамічні бібліотеки (.a/.so, .lib/.dll)',
          'Написання Makefile для багатофайлових проєктів',
          'CMake як сучасний інструмент збірки',
          'Прапорці компілятора для безпеки: stack protector, ASLR, RELRO',
        ],
      },
      {
        title: 'Основи exploit development',
        icon: 'warning',
        intro: 'Практичне застосування знань пам\'яті до розуміння того, як експлуатуються вразливості.',
        topics: [
          'Anatomiя переповнення стекового буфера',
          'Контроль instruction pointer через overflow',
          'Написання та впровадження простого shellcode',
          'Захисні механізми компілятора/ОС та їхній вплив на експлуатацію',
          'Зв\'язок з курсом Reverse Engineering для поглибленого exploit dev',
        ],
      },
      {
        title: 'Оптимізація та профілювання коду',
        icon: 'zap',
        intro: 'Написання коректного коду — половина справи; продуктивний системний софт вимагає оптимізації.',
        topics: [
          'Профілювання через gprof/perf',
          'Cache-friendly структури даних та locality of reference',
          'Уникнення зайвих копіювань (move semantics у C++)',
          'Компіляторні оптимізації (-O2/-O3) та їхні компроміси',
        ],
      },
    ],
    bonus: [
      'Основи написання власного ядерного модуля Linux (концептуальний вступ)',
      'Inline-асемблер у C/C++ для критичних ділянок коду',
      'Основи розробки крос-платформного коду (Windows/Linux API відмінності)',
      'Fuzzing власного коду через AFL++ для пошуку вразливостей',
      'Модерні можливості C++20/23: coroutines, concepts (оглядово)',
    ],
    careers: [
      'C/C++ Developer',
      'Systems Programmer',
      'Embedded Software Engineer',
      'Exploit Developer',
      'Reverse Engineer (база для подальшої спеціалізації)',
    ],
    nextSteps: [
      'Поглиблення через курс «Reverse Engineering» для exploit development',
      'Практика на pwn-задачах CTF-змагань',
      'Внесок у open-source системні проєкти (compiler/OS-рівень)',
      'Вивчення специфіки конкретної платформи: embedded, драйвери, ядро ОС',
    ],
  },

  // ───────────────────────────── C# Development ─────────────────────────────
  csharp: {
    overview: 'Практичний курс розробки на C# та .NET: від синтаксису мови до повноцінних веб-застосунків на ASP.NET Core з базою даних, автентифікацією та безпекою. Орієнтований на enterprise-розробку та подальшу спеціалізацію у application security.',
    outcomes: [
      'Впевнене володіння C# та платформою .NET',
      'Навички розробки Web API та MVC-застосунків на ASP.NET Core',
      'Вміння працювати з базами даних через Entity Framework Core',
      'Розуміння автентифікації/авторизації в .NET-екосистемі',
      'Базові навички тестування та розгортання .NET-застосунків',
      'Розуміння типових вразливостей .NET-застосунків та методів захисту',
    ],
    tools: ['.NET 8', 'ASP.NET Core', 'Entity Framework Core', 'Visual Studio/Rider', 'xUnit', 'Docker', 'Swagger'],
    modules: [
      {
        title: 'Основи C# та .NET',
        icon: 'code',
        intro: 'Фундамент мови та розуміння екосистеми .NET перед переходом до веб-розробки.',
        topics: [
          'Синтаксис C#: типи, змінні, оператори, керуючі конструкції',
          'ООП: класи, інтерфейси, успадкування, поліморфізм',
          'Колекції та LINQ для роботи з даними',
          'Delegates, events, лямбда-вирази',
          'Nullable reference types та сучасні можливості C# 12',
        ],
      },
      {
        title: 'ASP.NET Core: основи веб-розробки',
        icon: 'server',
        intro: 'Побудова веб-застосунків на найпопулярнішому фреймворку в .NET-екосистемі.',
        topics: [
          'Архітектура ASP.NET Core: middleware pipeline, Dependency Injection',
          'MVC-патерн: Controllers, Views, Models',
          'Маршрутизація (routing) та обробка HTTP-запитів',
          'Razor Pages як альтернатива класичному MVC',
          'Конфігурація застосунку: appsettings.json, environment variables',
        ],
      },
      {
        title: 'Робота з базами даних',
        icon: 'notes',
        intro: 'Персистентність даних через сучасний ORM-підхід Microsoft.',
        topics: [
          'Entity Framework Core: DbContext, моделі, конфігурація',
          'LINQ to Entities для запитів до бази даних',
          'Міграції (Migrations) для еволюції схеми БД',
          'Code First vs Database First підходи',
          'Оптимізація запитів: eager/lazy loading, N+1 problem',
        ],
      },
      {
        title: 'Web API та REST',
        icon: 'globe',
        intro: 'Побудова API — основного способу взаємодії сучасних застосунків.',
        topics: [
          'Проєктування RESTful API: ресурси, HTTP-методи, статус-коди',
          'ASP.NET Core Web API: контролери, model binding, валідація',
          'Документування через Swagger/OpenAPI',
          'Versioning API та зворотна сумісність',
          'Обробка помилок через middleware (Exception Handling)',
        ],
      },
      {
        title: 'Автентифікація та авторизація',
        icon: 'lock',
        intro: 'Захист застосунку на рівні «хто ти» та «що тобі дозволено».',
        topics: [
          'ASP.NET Core Identity: реєстрація, вхід, управління користувачами',
          'JWT-автентифікація для Web API',
          'Role-based та Policy-based авторизація',
          'OAuth2/OpenID Connect інтеграція (наприклад, через IdentityServer)',
          'Захист від типових атак: CSRF-токени, secure cookies',
        ],
      },
      {
        title: 'Async/Await та багатопоточність',
        icon: 'zap',
        intro: 'Асинхронне програмування — необхідність для продуктивних .NET-застосунків.',
        topics: [
          'async/await синтаксис та Task-based Asynchronous Pattern',
          'Task vs Thread: коли що використовувати',
          'ConfigureAwait та типові пастки асинхронного коду',
          'Паралельна обробка через Parallel.ForEach, PLINQ',
          'Cancellation tokens для керованого скасування операцій',
        ],
      },
      {
        title: 'Тестування',
        icon: 'target',
        intro: 'Якісний .NET-застосунок неможливий без систематичного тестування.',
        topics: [
          'Unit-тестування через xUnit/NUnit',
          'Mock-об\'єкти через Moq для ізоляції залежностей',
          'Integration-тестування ASP.NET Core застосунків (WebApplicationFactory)',
          'Test-Driven Development (TDD) базові принципи',
        ],
      },
      {
        title: 'Desktop-розробка',
        icon: 'code',
        intro: 'Огляд desktop-напрямку .NET-розробки для повноти картини екосистеми.',
        topics: [
          'WPF: XAML, data binding, MVVM-патерн',
          'WinForms як легша альтернатива для простих утиліт',
          '.NET MAUI для крос-платформної desktop/mobile розробки (оглядово)',
        ],
      },
      {
        title: 'REST API та мікросервіси у production',
        icon: 'server',
        intro: 'Перехід від навчального застосунку до архітектури, готової до реального навантаження.',
        topics: [
          'Основи мікросервісної архітектури та комунікації між сервісами',
          'Docker: контейнеризація .NET-застосунків',
          'Health checks та готовність до production',
          'Логування через Serilog та структуроване логування',
          'Кешування (Response Caching, Redis-інтеграція базово)',
        ],
      },
      {
        title: 'Безпека .NET-застосунків',
        icon: 'shield',
        intro: 'Практичний погляд на типові вразливості .NET-екосистеми та захист від них.',
        topics: [
          'SQL Injection у контексті Entity Framework (parametrized queries за замовчуванням, ризики Raw SQL)',
          'Insecure Deserialization у .NET (BinaryFormatter та чому його не варто використовувати)',
          'Mass Assignment у моделях прив\'язки (overposting)',
          'Secrets management: Azure Key Vault, User Secrets для розробки',
          'Security headers та HTTPS enforcement в ASP.NET Core',
        ],
      },
      {
        title: 'Розгортання застосунків',
        icon: 'rocket',
        intro: 'Доведення застосунку від локальної розробки до робочого production-середовища.',
        topics: [
          'Публікація застосунку: dotnet publish, self-contained deployment',
          'Розгортання на IIS та через Docker-контейнери',
          'Основи CI/CD для .NET (GitHub Actions/Azure DevOps)',
          'Базові поняття Azure App Service для хостингу',
        ],
      },
    ],
    bonus: [
      'Blazor для побудови інтерактивних веб-UI на C# без JavaScript',
      'SignalR для real-time комунікації (чати, сповіщення)',
      'gRPC як високопродуктивна альтернатива REST для мікросервісів',
      'Основи Domain-Driven Design (DDD) у .NET-проєктах',
      'Clean Architecture та розділення шарів у великих застосунках',
    ],
    careers: [
      '.NET Developer / C# Developer',
      'Backend Developer (enterprise-сегмент)',
      'Full-stack розробник (C# + фронтенд)',
      '.NET Application Security Engineer',
    ],
    nextSteps: [
      'Microsoft Certified: Azure Developer Associate',
      'Поглиблене вивчення Clean Architecture та DDD на реальних проєктах',
      'Розгляд курсу «Web Security» для спеціалізації у AppSec для .NET',
      'Участь у open-source .NET-проєктах на GitHub',
    ],
  },

  // ───────────────────────────── Systems Administration ─────────────────────────────
  sysadmin: {
    overview: 'Комплексний курс системного адміністрування Linux-інфраструктури: від основ командного рядка до автоматизації, моніторингу та безпеки production-серверів. Практична база для DevOps та SRE-напрямків.',
    outcomes: [
      'Впевнене адміністрування Linux-серверів у продакшн-середовищі',
      'Навички написання Bash-скриптів для автоматизації рутинних задач',
      'Вміння налаштовувати та підтримувати мережеву інфраструктуру',
      'Практичні навички роботи з Docker та базовими концепціями Kubernetes',
      'Розуміння моніторингу, логування та побудови систем резервного копіювання',
      'Базові навички hardening та захисту Linux-серверів',
    ],
    tools: ['Linux (Ubuntu/Debian/CentOS)', 'Bash', 'Nginx', 'Docker', 'Ansible', 'Zabbix/Prometheus', 'Grafana'],
    modules: [
      {
        title: 'Основи Linux',
        icon: 'server',
        intro: 'Фундамент будь-якої адміністративної роботи — впевнене володіння командним рядком та розуміння філософії Unix.',
        topics: [
          'Файлова система Linux: структура каталогів, типи файлів',
          'Права доступу: chmod, chown, spеціальні біти (SUID/SGID/sticky)',
          'Управління процесами: ps, top/htop, kill, systemd-сервіси',
          'Пакетні менеджери: apt/yum/dnf, компіляція з вихідного коду',
          'Керування користувачами та групами, sudo-конфігурація',
        ],
      },
      {
        title: 'Bash-скриптинг',
        icon: 'code',
        intro: 'Автоматизація — головна навичка системного адміністратора, яка відрізняє professional від new-comer.',
        topics: [
          'Синтаксис Bash: змінні, умовні конструкції, цикли',
          'Робота з текстом: grep, sed, awk, регулярні вирази',
          'Написання скриптів для рутинних адміністративних задач',
          'Планування завдань: cron, systemd timers',
          'Обробка помилок та логування у власних скриптах',
        ],
      },
      {
        title: 'Мережеве адміністрування',
        icon: 'globe',
        intro: 'Розуміння та керування мережевою інфраструктурою — від локальної конфігурації до маршрутизації.',
        topics: [
          'TCP/IP стек, налаштування мережевих інтерфейсів',
          'DNS: налаштування BIND/dnsmasq, типи записів',
          'DHCP-сервер: конфігурація та troubleshooting',
          'Firewall: iptables/nftables, базові політики безпеки',
          'VPN: основи WireGuard/OpenVPN для захищеного доступу',
        ],
      },
      {
        title: 'Веб-сервери',
        icon: 'server',
        intro: 'Nginx та Apache — основа хостингу переважної більшості вебзастосунків у світі.',
        topics: [
          'Nginx: конфігурація virtual hosts, location-блоки',
          'Reverse proxy та load balancing налаштування',
          'Apache: .htaccess, mod_rewrite базово',
          'SSL/TLS: отримання сертифікатів (Let\'s Encrypt), налаштування HTTPS',
          'Оптимізація продуктивності веб-сервера (caching, compression)',
        ],
      },
      {
        title: 'Віртуалізація та контейнеризація',
        icon: 'code',
        intro: 'Сучасна інфраструктура немислима без контейнерів — індустріальний стандарт розгортання застосунків.',
        topics: [
          'Основи віртуалізації: KVM, VirtualBox концептуально',
          'Docker: образи, контейнери, Dockerfile, docker-compose',
          'Мережі та volumes у Docker',
          'Основи Kubernetes: Pods, Deployments, Services (концептуальний вступ)',
          'Реєстри образів (Docker Hub, приватні реєстри)',
        ],
      },
      {
        title: 'Моніторинг систем',
        icon: 'target',
        intro: 'Без моніторингу неможливо дізнатись про проблему до того, як про неї повідомить користувач.',
        topics: [
          'Zabbix: агенти, тригери, дашборди',
          'Prometheus + Grafana: збір метрик, візуалізація',
          'Логування: journald, rsyslog, централізація логів',
          'Alerting-стратегії та уникнення alert fatigue',
          'SLA/SLO/SLI базові поняття для оцінки надійності',
        ],
      },
      {
        title: 'Резервне копіювання та відновлення',
        icon: 'lock',
        intro: 'Найважливіша, часто недооцінена частина адміністрування — готовність до катастрофи.',
        topics: [
          'Стратегії backup: повний, інкрементальний, диференційний',
          'Правило 3-2-1 для надійного зберігання копій',
          'Інструменти: rsync, restic, borgbackup',
          'Disaster Recovery Plan: RTO/RPO, тестування відновлення',
          'Backup баз даних: специфіка MySQL/PostgreSQL',
        ],
      },
      {
        title: 'Автоматизація інфраструктури',
        icon: 'zap',
        intro: 'Перехід від ручного налаштування серверів до Infrastructure as Code.',
        topics: [
          'Основи Ansible: inventory, playbooks, modules',
          'Ідемпотентність як ключовий принцип автоматизації',
          'Ролі (roles) та структурування великих Ansible-проєктів',
          'Базове знайомство з Terraform для provisioning інфраструктури',
        ],
      },
      {
        title: 'Безпека Linux-серверів',
        icon: 'shield',
        intro: 'Захист production-інфраструктури — обов\'язкова компетенція, а не опціональна надбудова.',
        topics: [
          'SSH hardening: ключі замість паролів, зміна порту, Fail2Ban',
          'SELinux/AppArmor: принципи Mandatory Access Control',
          'Регулярне оновлення та патч-менеджмент',
          'Аудит системи: auditd, виявлення підозрілої активності',
          'Принцип найменших привілеїв у конфігурації сервісів',
        ],
        tip: 'Ніколи не залишайте SSH-доступ по паролю на production-сервері — це перше, що перевіряють автоматизовані сканери атак.',
      },
      {
        title: 'Хмарні платформи',
        icon: 'globe',
        intro: 'Сучасна інфраструктура дедалі частіше живе не на власних серверах, а в хмарі.',
        topics: [
          'Базові поняття: IaaS, PaaS, SaaS',
          'Огляд AWS: EC2, S3, VPC, IAM базово',
          'Огляд Google Cloud Platform та Azure (концептуально, порівняння з AWS)',
          'Основи cost optimization у хмарних середовищах',
        ],
      },
    ],
    bonus: [
      'Основи HAProxy для складних сценаріїв балансування навантаження',
      'ELK Stack для централізованого логування у великих інфраструктурах',
      'Основи CI/CD пайплайнів для автоматизації розгортання (GitLab CI/GitHub Actions)',
      'High Availability кластери: Keepalived, Pacemaker (концептуально)',
      'Основи роботи з базами даних на рівні адміністратора (реплікація, бекапи PostgreSQL/MySQL)',
    ],
    careers: [
      'System Administrator / Linux Administrator',
      'DevOps Engineer',
      'Site Reliability Engineer (SRE)',
      'Infrastructure Engineer',
      'Cloud Engineer',
    ],
    nextSteps: [
      'RHCSA/RHCE (Red Hat Certified System Administrator/Engineer)',
      'AWS Certified SysOps Administrator',
      'Практика на власному домашньому лабораторному стенді (home lab)',
      'Поглиблення DevOps-напрямку через вивчення Kubernetes у деталях',
    ],
  },
};

function run() {
  const owner = db.prepare(
    `SELECT id, role FROM users WHERE role = 'owner' ORDER BY created_at ASC LIMIT 1`,
  ).get() || db.prepare(`SELECT id, role FROM users WHERE role = 'developer' LIMIT 1`).get();

  if (!owner) {
    console.error('[seed-course-content] No owner/developer account found — cannot save content pages.');
    process.exit(1);
  }

  const programs = db.prepare('SELECT id, slug, name FROM programs').all();
  let saved = 0;

  for (const program of programs) {
    const course = COURSES[program.slug];
    if (!course) {
      console.log(`[seed-course-content] Skipping "${program.slug}" (${program.name}) — no content authored for this slug.`);
      continue;
    }

    const sections = buildSections(course);
    contentService.savePage('program', program.id, owner.id, owner.role, {
      title: program.name,
      is_published: true,
      sections,
    });

    const blockCount = sections.reduce((sum, s) => sum + s.blocks.length, 0);
    console.log(`[seed-course-content] Saved "${program.name}" — ${sections.length} sections, ${blockCount} blocks.`);
    saved += 1;
  }

  console.log(`[seed-course-content] Done. ${saved}/${programs.length} program pages populated.`);
}

run();
