import json
import os

import gspread
from google.oauth2.service_account import Credentials

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

# Colunas da planilha — ordem importa
SHEET_HEADERS = [
    "title",
    "url",
    "source",
    "category",
    "published_at",
    "summary",
    "region",
    "scraped_at",
    "type",
]


def _get_client() -> gspread.Client:
    """Autentica no Google Sheets via Service Account (credencial no env)."""
    creds_json = os.environ.get("GOOGLE_CREDENTIALS_JSON")
    if not creds_json:
        raise EnvironmentError(
            "Variável de ambiente GOOGLE_CREDENTIALS_JSON não definida.\n"
            "Adicione o JSON da Service Account como secret no GitHub Actions."
        )
    creds_dict = json.loads(creds_json)
    creds = Credentials.from_service_account_info(creds_dict, scopes=SCOPES)
    return gspread.authorize(creds)


def save_to_sheets(news_items: list, spreadsheet_id: str) -> int:
    """
    Salva notícias no Google Sheets, evitando duplicatas por URL.

    Args:
        news_items: lista de dicionários com as notícias coletadas
        spreadsheet_id: ID da planilha (parte da URL do Google Sheets)

    Returns:
        Número de novos registros inseridos
    """
    client = _get_client()
    sheet = client.open_by_key(spreadsheet_id).sheet1

    existing_data = sheet.get_all_values()

    # Cria cabeçalho se a planilha estiver vazia
    if not existing_data:
        sheet.append_row(SHEET_HEADERS)
        existing_urls: set = set()
    else:
        # URLs estão na segunda coluna (índice 1)
        existing_urls = {row[1] for row in existing_data[1:] if len(row) > 1}

    rows_to_add = []
    for item in news_items:
        url = item.get("url", "")
        # Pula se URL já existe OU se não tem URL (evita lixo sem identificador)
        if not url or url in existing_urls:
            continue
        rows_to_add.append(
            [
                item.get("title", ""),
                url,
                item.get("source", ""),
                item.get("category", ""),
                item.get("published_at", ""),
                item.get("summary", ""),
                item.get("region", ""),
                item.get("scraped_at", ""),
                item.get("type", ""),
            ]
        )
        existing_urls.add(url)  # evita duplicata dentro do mesmo batch

    if rows_to_add:
        # append_rows é mais eficiente que múltiplos append_row
        sheet.append_rows(rows_to_add, value_input_option="RAW")

    return len(rows_to_add)
