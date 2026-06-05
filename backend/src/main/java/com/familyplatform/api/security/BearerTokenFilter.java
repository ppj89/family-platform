package com.familyplatform.api.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import com.familyplatform.api.user.AppUserRepository;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class BearerTokenFilter extends OncePerRequestFilter {
  private final TokenService tokens;
  private final AppUserRepository users;

  public BearerTokenFilter(TokenService tokens, AppUserRepository users) {
    this.tokens = tokens;
    this.users = users;
  }

  @Override
  protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String authorization = request.getHeader("Authorization");
    if (authorization != null && authorization.startsWith("Bearer ")) {
      AuthenticatedUser user = tokens.verify(authorization.substring(7));
      if (user != null && isActiveSession(user)) {
        List<SimpleGrantedAuthority> authorities = user.platformAdmin()
            ? List.of(new SimpleGrantedAuthority("ROLE_PLATFORM_ADMIN"))
            : List.of(new SimpleGrantedAuthority("ROLE_USER"));
        SecurityContextHolder.getContext()
            .setAuthentication(new UsernamePasswordAuthenticationToken(user, null, authorities));
      }
    }
    filterChain.doFilter(request, response);
  }

  private boolean isActiveSession(AuthenticatedUser user) {
    return users.findById(user.id())
        .map(appUser -> user.sessionId() != null && user.sessionId().equals(appUser.getActiveSessionId()))
        .orElse(false);
  }
}
