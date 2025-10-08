"use client"

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

export default function RequireUsername({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        // Skip check if already on username page
        if (pathname === '/username') {
            return;
        }

        // Check if nickname exists in localStorage
        const nickname = localStorage.getItem('nickname');

        if (!nickname) {
            // Redirect to username page with return URL
            router.push(`/username?returnUrl=${encodeURIComponent(pathname)}`);
        }
    }, [pathname, router]);

    return <>{children}</>;
}