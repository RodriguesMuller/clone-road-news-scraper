import unittest

from scraper.sources.rss import extract_image_url
from scraper.utils.filters import first_image_in_html, safe_image_url
from scraper.utils.og_image import can_fetch_og_image, og_image_from_html


class NewsImageTest(unittest.TestCase):
    def test_feed_media_content_and_thumbnail(self):
        entry = {"media_content": [{"url": "https://s2-g1.glbimg.com/abc=/i.s3.glbimg.com/foto", "medium": "image"}]}
        self.assertTrue(extract_image_url(entry).startswith("https://s2-g1.glbimg.com/"))
        entry = {"media_thumbnail": [{"url": "https://cdn.exemplo.com/thumb/123"}]}
        self.assertEqual(extract_image_url(entry), "https://cdn.exemplo.com/thumb/123")

    def test_enclosure_and_img_in_summary(self):
        entry = {"enclosures": [{"href": "https://cdn.exemplo.com/a.jpg", "type": "image/jpeg"}]}
        self.assertEqual(extract_image_url(entry), "https://cdn.exemplo.com/a.jpg")
        entry = {"summary": '<p><img src="https://cdn.exemplo.com/b.webp" width="600"> Carreta tomba</p>'}
        self.assertEqual(extract_image_url(entry), "https://cdn.exemplo.com/b.webp")

    def test_rejects_tracking_pixels_logos_and_non_http(self):
        self.assertEqual(safe_image_url("https://ads.exemplo.com/pixel.gif"), "")
        self.assertEqual(safe_image_url("https://exemplo.com/static/logo.png"), "")
        self.assertEqual(safe_image_url("javascript:alert(1)"), "")
        self.assertEqual(safe_image_url("data:image/png;base64,AAA", assume_image=True), "")
        self.assertEqual(safe_image_url("//cdn.exemplo.com/c.jpg"), "https://cdn.exemplo.com/c.jpg")
        self.assertEqual(first_image_in_html('<img src="https://x.com/1x1.gif">'), "")

    def test_feed_without_image_returns_empty(self):
        self.assertEqual(extract_image_url({"summary": "Acidente na BR-116 sem foto"}), "")

    def test_og_image_from_article_html(self):
        page = '<head><meta property="og:image" content="/fotos/carreta.jpg"><meta name="twitter:image" content="https://x.com/t.jpg"></head>'
        self.assertEqual(og_image_from_html(page, "https://g1.globo.com/sp/noticia/x.ghtml"), "https://g1.globo.com/fotos/carreta.jpg")

    def test_google_news_redirects_are_not_fetched(self):
        self.assertFalse(can_fetch_og_image("https://news.google.com/rss/articles/CBMiabc"))
        self.assertTrue(can_fetch_og_image("https://g1.globo.com/sp/noticia/x.ghtml"))


if __name__ == "__main__":
    unittest.main()
