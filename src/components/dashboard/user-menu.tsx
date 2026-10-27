"use client";

import { Check, LogOut, Moon, Sun, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { switchAccountAction } from "@/app/(dashboard)/_actions/workspaces";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { authClient } from "@/lib/auth-client";
import { initials } from "@/lib/initials";

type MenuAccount = { id: string; name: string };

export function UserMenu({
  name,
  email,
  imageUrl,
  profileHref,
  accounts,
  currentAccountId,
}: {
  name: string;
  email: string;
  imageUrl: string | null;
  profileHref: string;
  accounts: MenuAccount[];
  currentAccountId: string;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();

  async function switchAccount(accountId: string) {
    const result = await switchAccountAction({ accountId });
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger aria-label="Account menu" className="rounded-full">
        <Avatar>
          {imageUrl ? <AvatarImage src={imageUrl} alt="" /> : null}
          <AvatarFallback>{initials(name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <div className="text-sm font-medium">{name}</div>
          <div className="truncate text-xs text-muted-foreground">{email}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={profileHref}>
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        >
          {resolvedTheme === "dark" ? <Sun /> : <Moon />}
          Toggle theme
        </DropdownMenuItem>
        {accounts.length > 1 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Switch account
            </DropdownMenuLabel>
            {accounts.map((a) => (
              <DropdownMenuItem
                key={a.id}
                disabled={a.id === currentAccountId}
                onSelect={() => switchAccount(a.id)}
              >
                <span className="flex-1 truncate">{a.name}</span>
                {a.id === currentAccountId ? <Check /> : null}
              </DropdownMenuItem>
            ))}
          </>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={async () => {
            await authClient.signOut();
            router.push("/sign-in");
            router.refresh();
          }}
        >
          <LogOut />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
