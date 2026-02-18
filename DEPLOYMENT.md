# FAH-Stats Deployment Guide

## Voraussetzungen

- GitHub Repository mit diesem Code
- SSH-Zugang zum Zielserver
- Node.js 18+ auf dem Server

---

## Option A: Plain Linux VPS

### 1. Server vorbereiten (einmalig)

```bash
# Als root auf dem Server:

# Node.js 20 LTS installieren
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs git

# PM2 global installieren
npm install -g pm2

# Deploy-User anlegen
useradd -m -s /bin/bash deploy
mkdir -p /opt/fah-stats
chown deploy:deploy /opt/fah-stats

# SSH-Key fuer GitHub Actions einrichten
su - deploy
ssh-keygen -t ed25519 -f ~/.ssh/github-actions -N ""
cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Private Key anzeigen -> in GitHub Secrets kopieren
cat ~/.ssh/github-actions
```

### 2. Repo auf Server klonen (einmalig)

```bash
su - deploy
cd /opt/fah-stats
git clone https://github.com/DEIN-USER/fah-stats.git .
npm ci --production
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Autostart nach Reboot
```

### 3. Nginx Reverse Proxy (optional, empfohlen)

```bash
apt-get install -y nginx
```

`/etc/nginx/sites-available/fah-stats`:
```nginx
server {
    listen 80;
    server_name stats.deine-domain.de;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/fah-stats /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# SSL mit Let's Encrypt
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d stats.deine-domain.de
```

### 4. GitHub Secrets konfigurieren

Im GitHub Repo unter **Settings > Secrets and variables > Actions**:

| Secret | Wert |
|--------|------|
| `LINUX_SSH_HOST` | Server-IP (z.B. `123.45.67.89`) |
| `LINUX_SSH_USER` | `deploy` |
| `LINUX_SSH_KEY` | Inhalt von `~/.ssh/github-actions` (Private Key) |
| `LINUX_SSH_PORT` | `22` (oder dein SSH-Port) |

### 5. Fertig!

Jeder Push auf `main` deployed automatisch auf den Server.

---

## Option B: Plesk VPS

### 1. Plesk Node.js vorbereiten

1. **Plesk > Extensions > Node.js** installieren (falls nicht vorhanden)
2. Domain/Subdomain anlegen (z.B. `stats.deine-domain.de`)
3. **Websites & Domains > stats.deine-domain.de > Node.js** aktivieren:
   - Document Root: `/fah-stats`
   - Application Mode: `production`
   - Application URL: `/`
   - Application Startup File: `server.js`

### 2. SSH-Zugang fuer GitHub Actions

```bash
# Als System-User der Domain (via Plesk SSH oder root):
ssh-keygen -t ed25519 -f ~/.ssh/github-actions -N ""
cat ~/.ssh/github-actions.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Private Key anzeigen -> in GitHub Secrets kopieren
cat ~/.ssh/github-actions
```

### 3. Repo auf Server klonen (einmalig)

```bash
# In das App-Verzeichnis wechseln
cd /var/www/vhosts/deine-domain.de/fah-stats
git clone https://github.com/DEIN-USER/fah-stats.git .
npm ci --production
```

In Plesk: **Node.js > NPM install** klicken und App starten.

### 4. GitHub Secrets konfigurieren

| Secret | Wert |
|--------|------|
| `PLESK_SSH_HOST` | Server-IP |
| `PLESK_SSH_USER` | System-User der Domain (z.B. `deinedomain_user`) |
| `PLESK_SSH_KEY` | Private Key |
| `PLESK_SSH_PORT` | `22` |
| `PLESK_APP_DIR` | `/var/www/vhosts/deine-domain.de/fah-stats` |

### 5. Plesk-spezifische Hinweise

- Plesk verwaltet Node.js-Apps intern mit PM2
- Port-Binding: Plesk leitet automatisch ueber Nginx an den Node.js-Port weiter
- SSL: Unter **Websites & Domains > SSL/TLS-Zertifikate > Let's Encrypt** aktivieren
- Falls Plesk die App selbst startet, muss der PORT ggf. via Plesk-Umgebungsvariablen gesetzt werden

---

## Manuelles Deployment ausloesen

Beide Workflows haben `workflow_dispatch` aktiviert. Du kannst sie manuell starten:

**GitHub > Actions > "Deploy to ..." > Run workflow**

---

## Troubleshooting

```bash
# Logs anschauen (Linux VPS)
pm2 logs fah-stats

# Status pruefen
pm2 status

# Neustart erzwingen
pm2 restart fah-stats

# Plesk: Logs im Plesk Panel unter
# Websites & Domains > Logs
```
