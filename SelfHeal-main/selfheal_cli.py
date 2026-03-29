import argparse
import sys
import os

from selfheal_sdk.client import SelfHealClient

def main():
    parser = argparse.ArgumentParser(description="SelfHeal Python CLI")
    subparsers = parser.add_subparsers(dest="command")

    # Command: process
    parser_heal = subparsers.add_parser("heal", help="Manually heal a selector using a local HTML file")
    parser_heal.add_argument("--selector", required=True, help="The broken CSS selector")
    parser_heal.add_argument("--file", required=True, help="Path to the HTML file containing the new DOM state")
    parser_heal.add_argument("--intent", default="No specific intent", help="Intent of the selector")

    args = parser.parse_args()

    if args.command == "heal":
        if not os.path.exists(args.file):
            print(f"File not found: {args.file}")
            sys.exit(1)
            
        with open(args.file, "r") as f:
            html = f.read()
            
        print(f"Healing selector: {args.selector}")
        print(f"Intent: {args.intent}")
        print("Connecting to backend (http://localhost:5000)...")
        
        client = SelfHealClient()
        new_sel = client.heal_selector(args.selector, html, args.intent)
        if new_sel:
            print(f"\n✅ Healed Selector: {new_sel}")
        else:
            print("\n❌ Healing failed.")
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
