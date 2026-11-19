from django.shortcuts import render
from django.conf import settings
from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.contrib.auth.models import Group, User
from django.core.paginator import EmptyPage, PageNotAnInteger, Paginator
from django.db.models import Avg, Count, Q
from django.http import (HttpResponse, HttpResponseBadRequest,
                         HttpResponseNotFound, HttpResponseRedirect)
from django.shortcuts import redirect, render
from django.template import RequestContext
from django.views.decorators.csrf import csrf_exempt

from apps.core.models import Usuario

def home(request):
    return redirect('login')

@login_required
def pre_check_profile(request):
    pass

@login_required
def check_profile(request):
    try:
        profile = Usuario.objects.filter(user_id=request.user.id).get()
    except:
        messages.add_message(request, messages.INFO, 'Hubo un error con su usuario, por favor contactese con los administradores')
        return redirect('login')
    if profile.group_id == 1:
        return redirect('main_admin')
    else:
        return redirect('logout')

@login_required
def main_admin(request):
    try:
        profile = Usuario.objects.filter(user_id=request.user.id).get()
    except:
        messages.add_message(request, messages.INFO, 'Hubo un error con su usuario, por favor contactese con los administradores')
        return redirect('login')
    if profile.group_id == 1:
        template_name = 'core/main_admin.html'
        return render(request,template_name)
    else:
        return redirect('logout')