import sys
import json
from bs4 import BeautifulSoup
from src.parser import GoogleShoppingImmersiveParser


def main(path: str = '/home/abinash.sonowal/Downloads/markup.html') -> None:
	with open(path, 'rb') as f:
		raw = f.read().decode('utf-8', errors='replace')

	soup = BeautifulSoup(raw, 'lxml')
	parsed = GoogleShoppingImmersiveParser.parse_product(soup, url=path, final_url="https://www.google.com/search?ibp=oshop&q=iphone&prds=headlineOfferDocid%3A13956254064939509268%2CimageDocid%3A15123664496597116479%2Ccatalogid%3A10409234372921783985%2Cgpcid%3A4728907421224624008%2Crds%3APC_4728907421224624008%7CPROD_PC_4728907421224624008%2Cpvt%3Ahg&hl=en&gl=in&udm=28", html=raw)

	# Basic sanity checks
	assert isinstance(parsed, dict), 'parsed result must be a dict'
	for key in ('title', 'features', 'buying_options'):
		assert key in parsed, f'missing key: {key}'
	assert isinstance(parsed.get('features'), dict), '`features` must be a dict'
	assert isinstance(parsed.get('buying_options'), list), '`buying_options` must be a list'

	print(json.dumps(parsed, indent=2, ensure_ascii=False))
	print('\nParse OK')


if __name__ == '__main__':
	try:
		if len(sys.argv) > 1:
			main(sys.argv[1])
		else:
			main()
	except AssertionError as exc:
		print('Test failed:', exc)
		sys.exit(2)
	except Exception as exc:
		print('Error during parse:', exc)
		sys.exit(3)

