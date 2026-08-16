/** Приклади багатоетапних (multi-stage) CTF-завдань — демонструють ланцюжок стадій.
 *  Усі стадії самодостатні (не потребують Docker-стенду): дані для розв'язку
 *  наведені прямо в описі стадії, прапор виводиться логічно з нього. */
export const MULTISTAGE_EXAMPLES = [
  {
    slug: 'web-exploitation-chain',
    title: 'Web Exploitation Chain',
    description: 'Багатоетапний web-квест: розвідка → обхід автентифікації → IDOR → захоплення адмінки. Кожна стадія відкриває наступну.',
    category: 'web',
    difficulty: 'medium',
    stages: [
      {
        title: 'Розвідка',
        description: 'Дамп заголовків відповіді сервера:\n\nHTTP/1.1 200 OK\nServer: nginx/1.18.0\nX-Powered-By: PHP/7.4\nSet-Cookie: session=a8f1; path=/\nX-Debug-Token: 9f31-recon\n\nРозробники лишили debug-заголовок. Прапор: lab{debug_<значення X-Debug-Token без дефісу>}',
        points: 50,
        flag: 'lab{debug_9f31recon}',
        hint_text: 'Приберіть дефіс зі значення X-Debug-Token: 9f31-recon → 9f31recon.',
        hint_cost: 15,
      },
      {
        title: 'Обхід автентифікації',
        description: 'Бекенд форми входу:\n\n$query = "SELECT * FROM users WHERE login=\'$login\' AND pass=\'$pass\'";\n\nКласична SQL-ін\'єкція обходить перевірку. Прапор статичний: lab{sqli_bypass_ok}',
        points: 100,
        flag: 'lab{sqli_bypass_ok}',
        hint_text: "Підставте у поле login: ' OR '1'='1 — і перевірка завжди істинна.",
        hint_cost: 25,
      },
      {
        title: 'IDOR',
        description: 'Відповіді API:\n\nGET /api/orders/1042 → {"id":1042,"owner":"user17"}\nGET /api/orders/1041 → {"id":1041,"owner":"admin","note":"token=7c2e91"}\n\nЗмінюючи id, знайдіть чуже замовлення з токеном. Прапор: lab{idor_<токен>}',
        points: 100,
        flag: 'lab{idor_7c2e91}',
        hint_text: 'Спробуйте id на 1 менше за власний — токен admin у полі note.',
        hint_cost: 25,
      },
      {
        title: 'Ескалація до адміна',
        description: 'Використайте знайдений токен як заголовок Authorization: Bearer <токен> для запиту до /admin. Прапор: lab{admin_<токен>_owned}',
        points: 100,
        flag: 'lab{admin_7c2e91_owned}',
        hint_text: 'Підставте токен з попередньої стадії у шаблон lab{admin_<токен>_owned}.',
        hint_cost: 30,
      },
    ],
  },
  {
    slug: 'linux-user-to-root',
    title: 'Linux Box: User to Root',
    description: 'Класичний бокс: спершу початковий доступ (user), потім підвищення привілеїв до root.',
    category: 'network',
    difficulty: 'hard',
    stages: [
      {
        title: 'Foothold',
        description: 'Лог брутфорсу SSH:\n\n$ hydra -l www-data -P top100.txt ssh://target\nПеревірені паролі (перші 5 у списку): admin123, qwerty123, www-data321, letmein22, Summer2024!\nУспішним виявився 4-й пароль у списку.\n\nПрапор: lab{user_<пароль>}',
        points: 120,
        flag: 'lab{user_letmein22}',
        hint_text: 'Порахуйте елементи списку зліва направо — четвертий і є паролем: letmein22.',
        hint_cost: 30,
      },
      {
        title: 'Privilege escalation',
        description: 'www-data@box:~$ sudo -l\nUser www-data may run the following commands:\n    (root) NOPASSWD: /usr/bin/find\n\n/usr/bin/find дозволено запускати від root без пароля — класична GTFOBins-ескалація (find . -exec /bin/sh \\;). Прапор: lab{root_via_find}',
        points: 180,
        flag: 'lab{root_via_find}',
        hint_text: 'Погугліть "GTFOBins find" — там прямий рецепт privesc через find.',
        hint_cost: 40,
      },
    ],
  },
  {
    slug: 'crypto-warmup',
    title: 'Crypto Warm-up',
    description: 'Три короткі криптозавдання — від шифру Цезаря до основ RSA. Розминка перед серйозною криптографією.',
    category: 'crypto',
    difficulty: 'easy',
    stages: [
      {
        title: 'Шифр Цезаря',
        description: 'Розшифруйте рядок "ode{fdhvdu_khoor}" — кожна літера зсунута на +3 позиції по алфавіту відносно оригіналу. Зсуньте назад на 3 і отримаєте прапор.',
        points: 30,
        flag: 'lab{caesar_hello}',
        hint_text: "Кожну літеру зсуньте на -3 позиції: 'o'→'l', 'd'→'a', 'e'→'b' і т.д.",
        hint_cost: 10,
      },
      {
        title: 'Base64 + XOR',
        description: 'Рядок "LiMgOTotMB0vIzE2JzA/" — це Base64 від прапора, кожен байт якого захешовано XOR з ключем 0x42 (66). Розкодуйте Base64 у байти, застосуйте XOR з 0x42 до кожного байта і отримайте прапор.',
        points: 60,
        flag: 'lab{xor_master}',
        hint_text: "Base64-декодуйте рядок у байти, потім XOR кожного байта з числом 66 (0x42).",
        hint_cost: 15,
      },
      {
        title: 'RSA basics',
        description: 'Дано: n = 3233, e = 17, c = 2790. n = p·q, де p і q — прості числа (p=61, q=53). Знайдіть d (обернене до e за модулем φ(n)) і розшифруйте m = c^d mod n. Прапор: lab{rsa_<m>}',
        points: 90,
        flag: 'lab{rsa_65}',
        hint_text: 'φ(n) = (p-1)(q-1) = 3120. Знайдіть d, обернене до e=17 за модулем 3120 (d=2753), і порахуйте m = c^d mod n.',
        hint_cost: 20,
      },
    ],
  },
];
