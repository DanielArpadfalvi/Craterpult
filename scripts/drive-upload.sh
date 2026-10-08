#!/usr/bin/env bash
# Upload a file to the owner's Google Drive, overwriting the previous copy with the same name.
#
# Usage: scripts/drive-upload.sh <file> [drive-name]
# Env:   GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN (see scripts/drive-auth.ts)
#        GDRIVE_FOLDER_ID (optional) – target folder; otherwise the folder named
#        GDRIVE_FOLDER_NAME (default "Mobile games") is looked up by name.
set -euo pipefail

FILE="$1"
NAME="${2:-$(basename "$FILE")}"
FOLDER_NAME="${GDRIVE_FOLDER_NAME:-Mobile games}"
API=https://www.googleapis.com/drive/v3
UPLOAD=https://www.googleapis.com/upload/drive/v3

TOKEN=$(curl -sfS https://oauth2.googleapis.com/token \
  -d client_id="$GDRIVE_CLIENT_ID" \
  -d client_secret="$GDRIVE_CLIENT_SECRET" \
  -d refresh_token="$GDRIVE_REFRESH_TOKEN" \
  -d grant_type=refresh_token | jq -r .access_token)
AUTH="Authorization: Bearer $TOKEN"

# Drive query strings need ' and \ escaped.
q_escape() {
  local v=${1//\\/\\\\}
  v=${v//\'/\\\'}
  printf '%s' "$v"
}

FOLDER="${GDRIVE_FOLDER_ID:-}"
if [ -z "$FOLDER" ]; then
  Q="mimeType='application/vnd.google-apps.folder' and name='$(q_escape "$FOLDER_NAME")' and trashed=false"
  FOLDER=$(curl -sfS -G "$API/files" -H "$AUTH" --data-urlencode "q=$Q" \
    --data-urlencode "fields=files(id)" | jq -r '.files[0].id // empty')
  if [ -z "$FOLDER" ]; then
    echo "::error::Drive folder \"$FOLDER_NAME\" not found (set GDRIVE_FOLDER_ID)." >&2
    exit 1
  fi
fi

Q="'$FOLDER' in parents and name='$(q_escape "$NAME")' and trashed=false"
EXISTING=$(curl -sfS -G "$API/files" -H "$AUTH" --data-urlencode "q=$Q" \
  --data-urlencode "fields=files(id)" | jq -r '.files[0].id // empty')

MIME=application/vnd.android.package-archive
if [ -n "$EXISTING" ]; then
  # Same file id: links and the Drive app keep pointing at the newest build.
  curl -sfS -X PATCH "$UPLOAD/files/$EXISTING?uploadType=media" \
    -H "$AUTH" -H "Content-Type: $MIME" --data-binary "@$FILE" > /dev/null
  echo "Updated \"$NAME\" in Drive ($EXISTING)."
else
  META=$(jq -nc --arg n "$NAME" --arg p "$FOLDER" '{name: $n, parents: [$p]}')
  ID=$(curl -sfS -X POST "$UPLOAD/files?uploadType=multipart&fields=id" -H "$AUTH" \
    -F "metadata=$META;type=application/json;charset=UTF-8" \
    -F "file=@$FILE;type=$MIME" | jq -r .id)
  echo "Created \"$NAME\" in Drive ($ID)."
fi
